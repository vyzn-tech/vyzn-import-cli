import { program } from 'commander';
import { promises as fs, default as fssync } from 'fs';
import request from 'superagent';
import { URL, parse } from 'url';
import path from 'path';



async function main() {
    program
        .name('vyzn-import-cli')
        .description('Imports data into the vyzn platform.')
        .version('1.0.0');
    program
        .command('import-components')
        .description('import components from a JSON file and create missing materials')
        .requiredOption('-i, --input <file>', 'path to the file to import (.json)')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .requiredOption('-c, --category <id>', 'The id of the category into which to import')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        importComponents(o.input, o.url, o.auth, o.category, o.verbose);
    });
    program.parse();
}


async function importComponents(input, url, auth, category, verbose) {
    console.log("START");

    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);


    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    //get selected catalog
    const selectedCatalogue = await request.get(new URL('/catalogues/selected', url).href)
        .set('Authorization', authToken)
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    const selectedCatalogueId = selectedCatalogue.body.id;
    console.log(selectedCatalogueId)

    //get category types
    const types = await request.get(new URL('/types', url).href)
        .set('Authorization', authToken)
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');

    let categoryTypeMATId = null; //id of the category types
    let categoryTypeBTId = null;

    const categoryTypeMAT = 'MAT';
    const categoryTypeBT = 'BT';

    for (const t of types.body) {
        if (t.name == categoryTypeMAT) {
            categoryTypeMATId = t.id;
            break;
        }
    }

    for (const t of types.body) {
        if (t.name == categoryTypeBT) {
            categoryTypeBTId = t.id;
            break;
        }
    }
    //create base structure for import
    const categoryBT = await request.post(new URL('/categories', url).href)
    .send({
    "name": "BAUTEILE",
    "catalogue": selectedCatalogueId,
    "parent": category,
    "type": categoryTypeBTId,
    })
    .set('Authorization', authToken)
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json');
    const categoryBTId = categoryBT.body.id;
    
    const categoryMAT = await request.post(new URL('/categories', url).href)
    .send({
    "name": "MATERIALIEN",
    "catalogue": selectedCatalogueId,
    "parent": category,
    "type": categoryTypeMATId,
    })
    .set('Authorization', authToken)
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json');
    const categoryMATId = categoryMAT.body.id;


    //import json catalog exported from the platform
    const import_catalog = await readAndParseJson(input);

    //extract components and components keys
    const import_components = await getProductsFromImportCatalog("COMPONENT",import_catalog);
    const import_components_key = Object.keys(import_components);
    const import_components_key_confirmed = ['AW Mauerwerk tragend 330/160']; //components confirmed by the user for the import

    //components to be imported
    const confirmed_components = {}; // contains all information of the components that need to be imported

    // Iterate through the keys in the given list
    for (const key of import_components_key_confirmed) {
        // Check if the key exists in the components object
        if (key in import_components) {
        // Add the component information to the selectedComponents object
        confirmed_components[key] = import_components[key];
        }
    }

    //extract materials and create a list of materials needed to re-create all components
    const import_materials = await getProductsFromImportCatalog("MATERIAL",import_catalog);
    const unique_import_materials = await getAllUniqueNeededMaterialKeys(confirmed_components);

    const needed_materials = {}; // contains all information of the materials that need to be imported

    // Iterate through the keys in the given list
    for (const key of unique_import_materials) {
        // Check if the key exists in the components object
        if (key in import_materials) {
        // Add the component information to the selectedComponents object
        needed_materials[key] = import_materials[key];
        }
    }

    const needed_materials_key = Object.keys(needed_materials);
    for (const key of needed_materials_key) {
        let matName = key;
        let material = needed_materials[key];

        //creating materials
        try {
            const productTypeMAT = 'MATERIAL'
            const newProduct = await request.post(new URL('/products', url).href)
            .send({
            "name": matName,
            "productKey": matName,
            "category": categoryMATId,
            "type": productTypeMAT
            })
            .set('Authorization', authToken)
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');

            console.log(matName+" created successfully")
        }
        catch (err) {
            console.log(matName+" skipped - key used")
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

async function readAndParseJson(filePath) {
    const rawData = await fs.readFile(filePath, 'utf8');
    return JSON.parse(rawData);
}


async function getAllUniqueNeededMaterialKeys(components) {
    const uniqueMaterialKeys = new Set();

    // Iterate through each component
    for (const componentName in components) {
    const component = components[componentName];
    const matrixCells = component.matrix.cells;

    // Iterate through the matrix cells of the component
    for (const cellName in matrixCells) {
        const cell = matrixCells[cellName];
        const materialKey = cell.materialKey;

        // Add the materialKey to the uniqueMaterialKeys set
        if (materialKey) {
        uniqueMaterialKeys.add(materialKey);
        }
    }
    }

    // Convert the Set to an array and return it
    return Array.from(uniqueMaterialKeys);
}

async function getProductsFromImportCatalog(type, catalog) {
    const products = {};
    for (const [key, product] of Object.entries(catalog.products)) {
        if (product.type === type) {
            products[key] = product;
        }
    }
    return products;
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
main();
//# sourceMappingURL=main.js.map