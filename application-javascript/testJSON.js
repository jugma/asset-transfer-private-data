var fs = require('fs');
var data = JSON.parse(fs.readFileSync("./sbom1.json"));
var dataStr = JSON.stringify(data);