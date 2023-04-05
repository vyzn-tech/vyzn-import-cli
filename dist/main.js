import { program } from 'commander';
import { parseCSV } from 'csv-load-sync';
import { promises as fs, default as fssync } from 'fs';
import request from "superagent";
async function main() {
    program
        .name('vyzn-import-cli')
        .version('1.0.0')
        .description('Prepare a model for upload into the vyzn platform.')
        .requiredOption('-i, --input <file>', 'path to the file to import (.csv)');
    program.parse();
    const input = program.getOptionValue('input');
    if (await fileExists(input) == false) {
        console.error(`Error: Could not find input file at ${input}.`);
        process.exit(1);
    }
    const csv = await readCsv(input);
    const auth = 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlFpOTdLTWl1a2w4VzNRc09IblVzcyJ9.eyJ2eXpuX3JvbGVzIjpbIkNPTVBBTllfSUNDQ09OIiwiUk9MRV9BRE1JTiIsIlJPTEVfQURNSU5fTE9DQUwiLCJST0xFX0NSRUFUT1IiLCJST0xFX1JFQUQiLCJST0xFX1JFQURXUklURSJdLCJ2eXpuX2VtYWlsIjoiYS5oZW5rZUB2eXpuLnRlY2giLCJpc3MiOiJodHRwczovL3Z5em4tcHJvZC5ldS5hdXRoMC5jb20vIiwic3ViIjoiZ29vZ2xlLW9hdXRoMnwxMTQyMzYzNzY4ODc0MzMzNzM2MzgiLCJhdWQiOlsiaHR0cHM6Ly9kYnMtZ2F0ZXdheS1zZXJ2aWNlLXByb2QuYXp1cmV3ZWJzaXRlcy5uZXQiLCJodHRwczovL3Z5em4tcHJvZC5ldS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNjgwNjAyNTQ1LCJleHAiOjE2ODA2ODg5NDUsImF6cCI6Ik5SbkwxdHJBbDFPMUpqSUpuZDB3TWo2eEV6Sm9ObVRmIiwic2NvcGUiOiJvcGVuaWQgcHJvZmlsZSBlbWFpbCJ9.aUpgWgRMOPkVBeJeOoR43FG47V1Z-L4UCTEfBtWSOwpYeSalkJAf61fGzCnKbhiAiotYss0MnmkAiO5gr2wMOhULRWkmPOTcl3T35MCw63jkB4tSU27YhUUZastNgor0I1aA9GY6avxty2r0QmMRbejdKqgUjBtP43xGLoYr2gW4OJJcPAaQu2WvRnoajFytyiLobjsMbV-tN8kK6Nic80vvwB3efu77phT8jvZ-Ifkul0T5fqod1J05B6aResF0W-LN7RN1_Lbe8SJRYzjGaprO56_ODWIZ2BTqZSBH7l7vx_LxO7dz7EdCX2qc5x6G-ydHxZD5mQfHMcC-OE0yHQ';
    for (const row of csv) {
        console.info(row.Name);
        const newProduct = await request.post('https://dbs-gateway-service-prod.azurewebsites.net/products')
            .send({
            "name": row.Name,
            "productKey": row.ProductKey,
            "category": "115ca9b4-941f-4442-abae-ab626e415e44",
            "type": row.Type
        })
            .set('Authorization', auth)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        const id = newProduct.body.id;
        const attributeIds = {};
        for (const attr of newProduct.body.attributes) {
            attributeIds[attr.name] = attr.id;
        }
        const attributes = [];
        for (const attributeName of Object.keys(row)) {
            if (attributeName.startsWith("vyzn.") || attributeName.startsWith("KBOB")) {
                const id = attributeIds[attributeName];
                let value = row[attributeName];
                if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit")) {
                    value = parseFloat(value);
                }
                console.info(typeof value);
                attributes.push({
                    id: id,
                    value: value
                });
            }
        }
        console.info(JSON.stringify(attributes));
        const updatedProduct = await request.put('https://dbs-gateway-service-prod.azurewebsites.net/products/' + id)
            .send({
            "name": row.Name,
            "productKey": row.ProductKey,
            "category": "115ca9b4-941f-4442-abae-ab626e415e44",
            "type": row.Type,
            "status": "approved",
            "description": null,
            "hatchingPattern": null,
            "attributes": attributes
        })
            .set('Authorization', auth)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        //break;
    }
}
async function fileExists(path) {
    return new Promise((resolve, reject) => {
        var result = fssync.existsSync(path);
        resolve(result);
    });
}
async function readCsv(path) {
    const raw = await fs.readFile(path, { encoding: 'utf8', flag: 'r' });
    return parseCSV(raw);
}
main();
//# sourceMappingURL=main.js.map