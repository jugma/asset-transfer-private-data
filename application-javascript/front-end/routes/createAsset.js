import { Router } from 'express';
import fileupload from 'express-fileupload';
import createAsset from '../../createAsset.js';
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

        createAsset.createAsset(res, path).then(assetID => {
            return res.status(200).send(`Created asset: ${assetID}`);
        }).catch(e => {
            // error
            console.log(e);
            return res.status(500).send(e);
        });
    });
});

export default router;