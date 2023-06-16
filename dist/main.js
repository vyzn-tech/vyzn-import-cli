import { program } from 'commander';
import { parseCSV } from 'csv-load-sync';
import { promises as fs, default as fssync } from 'fs';
import request from 'superagent';
import { URL, parse } from 'url';
import { importMaterialsDb } from './import-materialsdb.js';
async function main() {
    program
        .name('vyzn-import-cli')
        .description('Imports data into the vyzn platform.')
        .version('1.0.0');
    program
        .command('import-products')
        .description('import products from a CSV file')
        .requiredOption('-i, --input <file>', 'path to the file to import (.csv)')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .requiredOption('-c, --category <id>', 'The id of the category into which to import')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        importProducts(o.input, o.url, o.auth, o.category, o.verbose);
    });
    program.command('delete-products')
        .description('delete products of a given category')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .requiredOption('-c, --category <id>', 'The id of the category')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        deleteProducts(o.url, o.auth, o.category, o.verbose);
    });
    program.command('import-materialsdb')
        .description('imports data from materialsdb.org source')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .requiredOption('-c, --category <id>', 'The id of the category')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        importMaterialsDb(o.url, o.auth, o.category, o.verbose);
    });
    program.parse();
}
async function importProducts(input, url, auth, category, verbose) {
    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);
    const csv = await readCsv(input);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const selectedCatalogue = await request.get(new URL('/catalogues/selected', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    const selectedCatalogueId = selectedCatalogue.body.id;
    for (const row of csv) {
        let product = null;
        try {
            let existingProdId = null;
            let existingProds = await request.get(new URL(`/catalogues/${selectedCatalogueId}/products?type=MATERIAL_LIST&productKey=${row.ProductKey}&limit=10`, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
            if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id) {
                existingProdId = existingProds.body[0].id;
            }
            if (existingProdId) {
                const existingProd = await request.get(new URL('/products/' + existingProdId, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json');
                if (existingProd && existingProd.body) {
                    product = existingProd.body;
                    console.log(`${row.ProductKey} Updating existing product`);
                }
            }
        }
        catch (error) { }
        let newType = row.Type;
        if (newType == "MATERIAL_LIST")
            newType = "REFERENCE_MATERIAL";
        if (!product) {
            const newProd = await request.post(new URL('/products', url).href)
                .send({
                "name": row.Name,
                "productKey": row.ProductKey,
                "category": category,
                "type": newType
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
            product = newProd.body;
            console.log(`${row.ProductKey} Creating new product`);
        }
        const id = product.id;
        const attributeIds = {};
        for (const attr of product.attributes) {
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
                attributes.push({
                    id: id,
                    value: value
                });
            }
        }
        if (verbose)
            console.debug(JSON.stringify(attributes));
        const updatedProduct = await request.put(new URL('/products/' + id, url).href)
            .send({
            "name": row.Name,
            "productKey": row.ProductKey,
            "category": category,
            "type": newType,
            "status": "approved",
            "description": null,
            "hatchingPattern": null,
            "attributes": attributes
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
    }
}
async function deleteProducts(url, auth, category, verbose) {
    await assertUrl(url);
    await assertFile(auth);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const selectedCatalogue = await request.get(new URL('/catalogues/selected', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    const cat = findSubcategoryById(selectedCatalogue.body.content, category);
    const childCategoriesRecursive = getAllCategoriesRecursive(cat);
    for (const categoryToDelete of childCategoriesRecursive) {
        if (verbose)
            console.log(`Deleting category '${categoryToDelete.name}'`);
        const productsInCategory = await request.get(new URL(`/categories/${categoryToDelete.id}/products`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        const numProducts = productsInCategory.body.length;
        let idx = 0;
        for (const product of productsInCategory.body) {
            if (verbose) {
                console.debug(`\tDeleting ${idx + 1}/${numProducts}: ${product.id} ${product.name}`);
            }
            try {
                await request.del(new URL(`/products/${product.id}`, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json');
            }
            catch (e) {
                console.error(console.error(e, e.stack));
            }
            idx++;
        }
        try {
            await request.del(new URL(`/categories/${categoryToDelete.id}`, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
        }
        catch (e) {
            console.error(console.error(e, e.stack));
        }
    }
}
async function assertUrl(url) {
    if (!stringIsAValidUrl(url, ['http', 'https'])) {
        console.error(`Error: Invalid url '${url}'.`);
        process.exit(1);
    }
}
async function assertFile(file) {
    if (await fileExists(file) == false) {
        console.error(`Error: Could not find file at '${file}'.`);
        process.exit(1);
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
const stringIsAValidUrl = (s, protocols) => {
    try {
        new URL(s);
        const parsed = parse(s);
        return protocols
            ? parsed.protocol
                ? protocols.map(x => `${x.toLowerCase()}:`).includes(parsed.protocol)
                : false
            : true;
    }
    catch (err) {
        return false;
    }
};
function findSubcategoryById(data, id) {
    var _a;
    if (data.id === id) {
        return data;
    }
    for (let i = 0; i < ((_a = data.subcategories) !== null && _a !== void 0 ? _a : []).length; i++) {
        let found = findSubcategoryById(data.subcategories[i], id);
        if (found) {
            return found;
        }
    }
    return null;
}
function getAllCategoriesRecursive(cat, resultList = []) {
    var _a;
    for (let i = 0; i < ((_a = cat.subcategories) !== null && _a !== void 0 ? _a : []).length; i++) {
        getAllCategoriesRecursive(cat.subcategories[i], resultList);
    }
    resultList.push(cat);
    return resultList;
}
main();
//# sourceMappingURL=main.js.map