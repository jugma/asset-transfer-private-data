'use strict';

const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { buildCAClient, registerAndEnrollUser, enrollAdmin } = require('./CAUtil.js');
const { buildCCPOrg1, buildCCPOrg2, buildWallet } = require('./AppUtil.js');

const myChannel = 'mychannel';
const myChaincodeName = 'private';

const memberAssetCollectionName = 'assetCollection';
const org1PrivateCollectionName = 'Org1MSPPrivateCollection';
const org2PrivateCollectionName = 'Org2MSPPrivateCollection';
const mspOrg1 = 'Org1MSP';
const mspOrg2 = 'Org2MSP';
const Org1UserId = 'appUser1';
const Org2UserId = 'appUser2';

const RED = '\x1b[31m\n';
const RESET = '\x1b[0m';

const logConfiguration = {
    transports: [
        new winston.transports.Console()
    ],
    format: winston.format.combine(
        winston.format.label({
            label: `Label🏷️`
        }),
        winston.format.timestamp({
           format: 'MMM-DD-YYYY HH:mm:ss'
       }),
        winston.format.printf(info => `${info.level}: ${info.label}: ${[info.timestamp]}: ${info.message}`),
    )
};

const logger = winston.createLogger(logConfiguration);

function prettyJSONString(inputString) {
    if (inputString) {
        return JSON.stringify(JSON.parse(inputString), null, 2);
    }
    else {
        return inputString;
    }
}

function doFail(msgString) {
    logger.error(`${RED}\t${msgString}${RESET}`);
}

function verifyAssetData(res, org, resultBuffer, expectedId, ownerUserId, appraisedValue) {

    let asset;
    if (resultBuffer) {
        asset = JSON.parse(resultBuffer.toString('utf8'));
    } else {
        doFail('Failed to read asset');
        res.status(500);
    }
    logger.info(`*** verify asset data for: ${expectedId}`);
    if (!asset) {
        doFail('Received empty asset');
        res.status(500);
    }
    if (expectedId !== asset.assetID) {
        doFail(`recieved asset ${asset.assetID} , but expected ${expectedId}`);
        res.status(500);
    }

    if (asset.owner.includes(ownerUserId)) {
        logger.info(`\tasset ${asset.assetID} owner: ${asset.owner}`);
    } else {
        doFail(`Failed owner check from ${org} - asset ${asset.assetID} owned by ${asset.owner}, expected userId ${ownerUserId}`);
        res.status(500);
    }
    if (appraisedValue) {
        if (asset.appraisedValue !== appraisedValue) {
            doFail(`Failed appraised value check from ${org} - asset ${asset.assetID} has appraised value of ${asset.appraisedValue}, expected value ${appraisedValue}`);
            res.status(500);
        }
    }
}

function verifyAssetPrivateDetails(resultBuffer, expectedId, dataStrSbom) {
    let assetPD;
    if (resultBuffer) {
        assetPD = JSON.parse(resultBuffer.toString('utf8'));
    } else {
        doFail('Failed to read asset private details');
    }
    logger.info(`*** verify private details: ${expectedId}`);
    if (!assetPD) {
        doFail('Received empty data');
    }
    if (expectedId !== assetPD.assetID) {
        doFail(`recieved ${assetPD.assetID} , but expected ${expectedId}`);
    }

    if (dataStrSbom) {
        if (assetPD.sbom !== dataStrSbom) {
            doFail(`Failed appraised value check - asset ${assetPD.assetID} has appraised value of ${assetPD.appraisedValue}, expected value ${appraisedValue}`);
        }
    }
}

async function initContractFromOrg1Identity(res) {
    logger.info('\n--> Fabric client user & Gateway init: Using Org1 identity to Org1 Peer');
    // build an in memory object with the network configuration (also known as a connection profile)
    const ccpOrg1 = buildCCPOrg1();

    // build an instance of the fabric ca services client based on
    // the information in the network configuration
    const caOrg1Client = buildCAClient(FabricCAServices, ccpOrg1, 'ca.org1.example.com');

    // setup the wallet to cache the credentials of the application user, on the app server locally
    const walletPathOrg1 = path.join(__dirname, 'wallet/org1');
    const walletOrg1 = await buildWallet(Wallets, walletPathOrg1);

    // in a real application this would be done on an administrative flow, and only once
    // stores admin identity in local wallet, if needed
    await enrollAdmin(caOrg1Client, walletOrg1, mspOrg1);
    // register & enroll application user with CA, which is used as client identify to make chaincode calls
    // and stores app user identity in local wallet
    // In a real application this would be done only when a new user was required to be added
    // and would be part of an administrative flow
    await registerAndEnrollUser(caOrg1Client, walletOrg1, mspOrg1, Org1UserId, 'org1.department1');

    try {
        // Create a new gateway for connecting to Org's peer node.
        const gatewayOrg1 = new Gateway();
        //connect using Discovery enabled
        await gatewayOrg1.connect(ccpOrg1,
            { wallet: walletOrg1, identity: Org1UserId, discovery: { enabled: true, asLocalhost: true } });

        return gatewayOrg1;
    } catch (error) {
        logger.error(`Error in connecting to gateway: ${error}`);
        res.status(500).send(error);
    }
}

async function initContractFromOrg2Identity(res, OrgName) {
    logger.info('\n--> Fabric client user & Gateway init: Using Org2 identity to Org2 Peer');

    if (OrgName == "Org2") {
        const ccpOrg2 = buildCCPOrg2();
        const caOrg2Client = buildCAClient(FabricCAServices, ccpOrg2, 'ca.org2.example.com');

        const walletPathOrg2 = path.join(__dirname, 'wallet/org2');
        const walletOrg2 = await buildWallet(Wallets, walletPathOrg2);

        await enrollAdmin(caOrg2Client, walletOrg2, mspOrg2);
        await registerAndEnrollUser(caOrg2Client, walletOrg2, mspOrg2, Org2UserId, 'org2.department1');

        try {
            // Create a new gateway for connecting to Org's peer node.
            const gatewayOrg2 = new Gateway();
            await gatewayOrg2.connect(ccpOrg2,
                { wallet: walletOrg2, identity: Org2UserId, discovery: { enabled: true, asLocalhost: true } });
    
            return gatewayOrg2;
        } catch (error) {
            logger.error(`Error in connecting to gateway: ${error}`);
            res.status(500).send(error);
        }

    } else if (OrgName == "Org3") {
        //TBD

    } else if (OrgName == "Org4") {
        //TBD
    }    
}

// Main workflow : usecase details at asset-transfer-private-data/chaincode-go/README.md
// This app uses fabric-samples/test-network based setup and the companion chaincode
// For this usecase illustration, we will use both Org1 & Org2 client identity from this same app
// In real world the Org1 & Org2 identity will be used in different apps to achieve asset transfer.
async function transferAsset(res, assetID1, OrgName, fileName) {
    try {

        var data = JSON.parse(fs.readFileSync(fileName));
        var dataStrSbom = JSON.stringify(data);

        /** ******* Fabric client init: Using Org1 identity to Org1 Peer ********** */
        const gatewayOrg1 = await initContractFromOrg1Identity(res);
        const networkOrg1 = await gatewayOrg1.getNetwork(myChannel);
        const contractOrg1 = networkOrg1.getContract(myChaincodeName);
        // Since this sample chaincode uses, Private Data Collection level endorsement policy, addDiscoveryInterest
        // scopes the discovery service further to use the endorsement policies of collections, if any
        contractOrg1.addDiscoveryInterest({ name: myChaincodeName, collectionNames: [memberAssetCollectionName, org1PrivateCollectionName] });

        /** ~~~~~~~ Fabric client init: Using Org2 identity to Org2 Peer ~~~~~~~ */
        const gatewayOrg2 = await initContractFromOrg2Identity(res, OrgName);
        const networkOrg2 = await gatewayOrg2.getNetwork(myChannel);
        const contractOrg2 = networkOrg2.getContract(myChaincodeName);
        contractOrg2.addDiscoveryInterest({ name: myChaincodeName, collectionNames: [memberAssetCollectionName, org2PrivateCollectionName] });
        let result;
        let transactionId;
        
        try {

            let randomNumber = Math.floor(Math.random() * 1000) + 1;
            // use a random key so that we can run multiple times

            logger.info('\n--> Evaluate Transaction: ReadAssetPrivateDetails from ' + org1PrivateCollectionName);
            // ReadAssetPrivateDetails reads data from Org's private collection. Args: collectionName, assetID
            result = await contractOrg1.evaluateTransaction('ReadAssetPrivateDetails', org1PrivateCollectionName, assetID1);
            //logger.info(`<-- result: ${prettyJSONString(result.toString())}`);
            verifyAssetPrivateDetails(result, assetID1, dataStrSbom);
        
            logger.info('\n~~~~~~~~~~~~~~~~ As Org2 Client ~~~~~~~~~~~~~~~~');
            logger.info('\n--> Evaluate Transaction: ReadAsset ' + assetID1);
            result = await contractOrg2.evaluateTransaction('ReadAsset', assetID1);
            logger.info(`<-- result: ${prettyJSONString(result.toString())}`);

            verifyAssetData(res, mspOrg2, result, assetID1, Org1UserId);

            // Buyer from Org2 agrees to buy the asset assetID1 //
            // To purchase the asset, the buyer needs to agree to the same value as the asset owner
            let dataForAgreement = { assetID: assetID1, sbom: dataStrSbom };
            let statefulTxn = contractOrg2.createTransaction('AgreeToTransfer');
            let tmpData = Buffer.from(JSON.stringify(dataForAgreement));
            statefulTxn.setTransient({
                asset_value: tmpData
            });
            transactionId = statefulTxn.getTransactionId();
            result = await statefulTxn.submit();

            logger.info('\n**************** As Org1 Client ****************');
            // All members can send txn ReadTransferAgreement, set by Org2 above
            logger.info('\n--> Evaluate Transaction: ReadTransferAgreement ' + assetID1);
            result = await contractOrg1.evaluateTransaction('ReadTransferAgreement', assetID1);
            logger.info(`<-- result: ${prettyJSONString(result.toString())}`);

            // Transfer the asset to Org2 //
            // To transfer the asset, the owner needs to pass the MSP ID of new asset owner, and initiate the transfer
            logger.info('\n--> Submit Transaction: TransferAsset ' + assetID1);

            statefulTxn = contractOrg1.createTransaction('TransferAsset');
            let buyerDetails = { assetID: assetID1, buyerMSP: mspOrg2 };
            tmpData = Buffer.from(JSON.stringify(buyerDetails));
            statefulTxn.setTransient({
                asset_owner: tmpData
            });
            result = await statefulTxn.submit();

            //Again ReadAsset : results will show that the buyer identity now owns the asset:
            logger.info('\n--> Evaluate Transaction: ReadAsset ' + assetID1);
            result = await contractOrg1.evaluateTransaction('ReadAsset', assetID1);
            logger.info(`<-- result: ${prettyJSONString(result.toString())}`);
            verifyAssetData(res, mspOrg1, result, assetID1, Org2UserId);
            
        } finally {
            // Disconnect from the gateway peer when all work for this client identity is complete
            gatewayOrg1.disconnect();
            gatewayOrg2.disconnect();
        }
        return transactionId;

    } catch (error) {
        logger.error(`Error in transaction: ${error}`);
        if (error.stack) {
            logger.error(error.stack);
            return res.status(500).send(error);

        }
    }
}

module.exports = {
    transferAsset
};
