import { Router } from 'express';
import fileupload from 'express-fileupload';
import transferAsset from '../../transferAsset.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const router = Router();
router.use(fileupload());

router.post('/', (req, res) => {

    const file = req.files.sbom;
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const path = __dirname + "/files/" + file.name;

    file.mv(path, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        
        let assetID = req.body.assetID;
        let OrgName = req.body.OrgName;
        transferAsset.transferAsset(res, assetID, OrgName, path).then(result => {
            return res.status(200).send(`Transferred asset: ${assetID} with transactionId: ${result}`);
        }).catch(e => {
            // error
            console.log(e);
            return res.status(500).send(assetID);
        });
    });

});

export default router;