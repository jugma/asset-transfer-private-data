import express from 'express';
import routes from './routes';

const app = express();

app.use('/createAsset', routes.createAsset);
app.use('/transferAsset', routes.transferAsset);

app.listen(8080);
