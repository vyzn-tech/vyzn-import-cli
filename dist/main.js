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
        .requiredOption('-t, --tenant <name>', 'The name of the tenant')
        .requiredOption('-c, --category <id>', 'The id of the category into which to import')
        .option('-v, --verbose', 'More detailed console output')
        .option('-d, --diff', 'Perform diff only')
        .action((o) => {
        importProducts(o.input, o.url, o.auth, o.tenant, o.category, o.verbose, o.diff);
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
    program
        .command('import-catalog')
        .description('import catalog from a JSON file')
        .requiredOption('-i, --input <file>', 'path to the file to import (.json)')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-t, --tenant <name>', 'The name of the tenant')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .option('-refmat, --refmaterials', 'import ref materials')
        .option('-mat, --materials', 'import materials')
        .option('-btech, --buildingtech', 'import building technologies (gebaudetechnik)')
        .option('-ores, --otherres', 'import other resources')
        .option('-comp, --components', 'import components')
        .option('-v, --verbose', 'More detailed console output')
        .option('-d, --diff', 'Perform diff only')
        .option('-f, --folder', 'Import to folder')
        .option('-c, --category <id>', 'The id of the category')
        .action((o) => {
        importCatalog(o.input, o.url, o.auth, o.tenant, o.verbose, o.diff, o.folder, o.category, o.refmaterials, o.materials, o.buildingtech, o.otherres, o.components);
    });
    program
        .command('patch-version')
        .description('patch a version from a CSV file')
        .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
        .requiredOption('-t, --tenant <name>', 'The name of the tenant')
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .requiredOption('-p, --project <id>', 'The id of the project to patch')
        .requiredOption('-b, --building <id>', 'The id of the building to patch')
        .requiredOption('-m, --modelversion <id>', 'The id of the version to patch')
        .requiredOption('-i, --input <file>', 'Path to the file to import (.csv)')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        patchVersion(o.url, o.tenant, o.auth, o.project, o.building, o.modelversion, o.input, o.verbose);
    });
    program
        .command('convert-oekobaudat')
        .description('convert oekobaudat CSV to JSON structure')
        .requiredOption('-i, --input <file>', 'Path to the oekobaudat CSV file')
        .requiredOption('-o, --output <file>', 'Path to the output JSON file')
        .option('-v, --verbose', 'More detailed console output')
        .action((o) => {
        convertOekobaudat(o.input, o.output, o.verbose);
    });
    program.parse();
}
async function importProducts(input, url, auth, tenant, category, verbose, diff) {
    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);
    const csv = await readCsv(input);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const catalogues = await request.get(new URL('/dbs-catalogue/catalogues', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant);
    const selectedCatalogueId = catalogues.body.selectedCatalogueId;
    const hierarchy = (await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant)).body;
    const types = (await request.get(new URL('/dbs-catalogue/types', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant)).body;
    for (const row of csv) {
        let product = null;
        try {
            let existingProdId = null;
            let existingProds = await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}/products?query=${encodeURIComponent(row.ProductKey)}&limit=10`, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == row.ProductKey) {
                existingProdId = existingProds.body[0].id;
            }
            if (existingProdId) {
                const existingProd = await request.get(new URL('/dbs-catalogue/products/' + existingProdId, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
                if (existingProd && existingProd.body) {
                    product = existingProd.body;
                    console.log(`${row.ProductKey} Updating existing product`);
                }
            }
        }
        catch (error) {
            console.log(error);
        }
        if (diff) {
            if (product) {
                for (const attributeName of Object.keys(row)) {
                    if (attributeName.startsWith("vyzn.") || attributeName.startsWith("KBOB")) {
                        let found = false;
                        for (const existingAttribute of product.attributes) {
                            if (existingAttribute.name == attributeName) {
                                found = true;
                                let newValue = row[attributeName];
                                if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit") && !attributeName.endsWith("LCARefDimension") && !attributeName.endsWith("eBKPh.Section") && !attributeName.endsWith(".ComponentClassification") && !attributeName.endsWith(".MepClassification")) {
                                    newValue = parseFloat(newValue);
                                }
                                if (existingAttribute.value != newValue) {
                                    console.log(`${row.ProductKey} attribute '${attributeName}' value mismatch (existing: ${existingAttribute.value}, new: ${row[attributeName]})`);
                                }
                                break;
                            }
                        }
                        if (!found)
                            console.log(`${row.ProductKey} attribute '${attributeName}' missing`);
                    }
                }
            }
            else {
                console.log(`${row.ProductKey} does not exist yet`);
            }
            continue;
        }
        let newType = row.Type;
        let newSubType = row.SubType;
        if (newSubType == '')
            newSubType = null;
        if (newType == "MATERIAL_LIST")
            newType = "REFERENCE_MATERIAL";
        if (!product) {
            const newProd = await request.post(new URL('/dbs-catalogue/products', url).href)
                .send({
                "name": row.Name,
                "productKey": row.ProductKey,
                "type": newType,
                "subType": newSubType,
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
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
                if (!id) {
                    console.log(`${row.ProductKey} Could not find attribute ${attributeName}`);
                    continue;
                }
                let value = row[attributeName];
                if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit") && !attributeName.endsWith("LCARefDimension") && !attributeName.endsWith("eBKPh.Section") && !attributeName.endsWith(".ComponentClassification") && !attributeName.endsWith(".MepClassification")) {
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
        const updatedProduct = await request.put(new URL('/dbs-catalogue/products/' + id, url).href)
            .send({
            "name": row.Name,
            "productKey": row.ProductKey,
            "type": newType,
            "subType": newSubType,
            "status": "approved",
            "description": null,
            "hatchingPattern": row.hatchingPattern,
            "attributes": attributes
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
    }
}
async function deleteProducts(url, auth, category, verbose) {
    await assertUrl(url);
    await assertFile(auth);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const selectedCatalogue = await request.get(new URL('/dbs-catalogue/catalogues/selected', url).href)
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
        const productsInCategory = await request.get(new URL(`/dbs-catalogue/categories/${categoryToDelete.id}/products`, url).href)
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
                await request.del(new URL(`/dbs-catalogue/products/${product.id}`, url).href)
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
            await request.del(new URL(`/dbs-catalogue/categories/${categoryToDelete.id}`, url).href)
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
const createdPathsCache = {};
const lcaProductsCache = {};
const materialsCache = {};
async function createCategoryPath(categoryPath, catalogueId, hierarchy, url, auth, tenant) {
    const categoryPathDelimiter = " > ";
    const paths = categoryPath.split(categoryPathDelimiter);
    const createdPathsCacheKey = paths.join(';');
    if (createdPathsCache[createdPathsCacheKey]) {
        return createdPathsCache[createdPathsCacheKey].id;
    }
    let currentNode = hierarchy.content;
    let lastCatId = null;
    for (let i = 0; i < paths.length; i++) {
        if (i == 0)
            continue;
        let found = false;
        if (currentNode) {
            for (const subcat of currentNode.subcategories) {
                if (subcat.name == paths[i]) {
                    currentNode = subcat;
                    found = true;
                    break;
                }
            }
        }
        if (!found) {
            const currentPath = paths.slice(0, i + 1);
            const currentPathKey = currentPath.join(';');
            if (createdPathsCache[currentPathKey]) {
                lastCatId = createdPathsCache[currentPathKey].id;
            }
            else {
                const newCat = (await request.post(new URL('/dbs-catalogue/categories', url).href)
                    .send({
                    "catalogue": catalogueId,
                    "name": paths[i],
                    "parent": (currentNode != null ? currentNode.id : lastCatId),
                })
                    .set('Authorization', auth)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant)).body;
                lastCatId = newCat.id;
                createdPathsCache[currentPathKey] = newCat;
            }
            currentNode = null;
        }
    }
    const leafCategoryId = lastCatId ? lastCatId : currentNode.id;
    return leafCategoryId;
}
async function importCatalog(input, url, auth, tenant, verbose, diff, folder, category, importRefMat, importMat, importBuildTech, importOtRes, importComp) {
    const lcaAttributeGroup = 'Ökobilanz';
    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);
    const componentsFile = await fs.readFile(input, { encoding: 'utf8', flag: 'r' });
    const componentsObj = JSON.parse(componentsFile);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const cataloguesUrl = new URL('/dbs-catalogue/catalogues', url).href;
    console.log('=== CATALOGUES API REQUEST DEBUG ===');
    console.log('Request URL:', cataloguesUrl);
    console.log('Tenant:', tenant);
    console.log('Auth token (first 50 chars):', authToken.substring(0, 50) + '...');
    console.log('=== END REQUEST DEBUG ===');
    const catalogues = await request.get(cataloguesUrl)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant);
    console.log('=== CATALOGUES API RESPONSE DEBUG ===');
    console.log('Response status:', catalogues.status);
    console.log('Response headers:', JSON.stringify(catalogues.headers, null, 2));
    console.log('Full catalogues.body:', JSON.stringify(catalogues.body, null, 2));
    console.log('catalogues.body.selectedCatalogueId:', catalogues.body.selectedCatalogueId);
    console.log('catalogues.body keys:', Object.keys(catalogues.body));
    console.log('=== END CATALOGUES DEBUG ===');
    const selectedCatalogueId = catalogues.body.selectedCatalogueId;
    const hierarchy = (await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant)).body;
    const types = (await request.get(new URL('/dbs-catalogue/types', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant)).body;
    const attributeGroups = await request.get(new URL('/dbs-catalogue/attributeGroups', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant);
    let lcaAttributeGroupId = null;
    for (const g of attributeGroups.body) {
        if (g.name == lcaAttributeGroup) {
            lcaAttributeGroupId = g.id;
            break;
        }
    }
    if (!lcaAttributeGroupId)
        throw `Could not find attribute group with name ${lcaAttributeGroup}`;
    if (importRefMat)
        await importProductsOfType(componentsObj.products, "REFERENCE_MATERIAL", selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category);
    if (importMat)
        await importProductsOfType(componentsObj.products, "MATERIAL", selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category);
    if (importBuildTech)
        await importProductsOfType(componentsObj.products, "BUILDING_TECHNOLOGY", selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category);
    if (importOtRes)
        await importProductsOfType(componentsObj.products, "OTHER_RESOURCE", selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category);
    if (importComp)
        await importProductsOfType(componentsObj.products, "COMPONENT", selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category);
}
let anchorFound = false;
async function importProductsOfType(products, type, selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, auth, tenant, verbose, diff, folder, category) {
    for (const [key, value] of Object.entries(products)) {
        let prod = value;
        if (prod.type != type)
            continue;
        await importSingleProduct(key, prod, selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, auth, tenant, verbose, diff, folder, category);
    }
}
async function importSingleProduct(prodKey, prod, selectedCatalogueId, hierarchy, lcaAttributeGroupId, url, authToken, tenant, verbose, diff, folder, category) {
    const migrateAttributes = false;
    var categoryId = category;
    if (!folder) {
        categoryId = await createCategoryPath(prod.categoryPath, selectedCatalogueId, hierarchy, url, authToken, tenant);
    }
    if (!categoryId)
        console.error(`missing category for product: ${prodKey}`);
    let product = null;
    try {
        let existingProdId = null;
        let existingProds = await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}/products?type=${prod.type}&query=${encodeURIComponent(prodKey)}&limit=10`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
        if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == prodKey) {
            existingProdId = existingProds.body[0].id;
        }
        if (existingProdId) {
            const existingProd = await request.get(new URL('/dbs-catalogue/products/' + existingProdId, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            if (existingProd && existingProd.body) {
                product = existingProd.body;
                console.log(`${prodKey} Updating existing product`);
            }
        }
    }
    catch (error) {
        console.log(error);
    }
    if (product && prod.type == "COMPONENT") {
        console.log(`${prodKey} Deleting existing product since it is a component`);
        await request.del(new URL('/dbs-catalogue/products/' + product.id, url).href)
            .send({
            "name": prod.name,
            "productKey": prodKey,
            "category": categoryId,
            "type": prod.type
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
        product = null;
    }
    if (!product) {
        console.log(`${prodKey} Creating new product`);
        const newProd = await request.post(new URL('/dbs-catalogue/products', url).href)
            .send({
            "name": prod.name,
            "productKey": prodKey,
            "category": categoryId,
            "type": prod.type,
            "subType": prod.subType
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
        product = newProd.body;
    }
    const id = product.id;
    const attributeIds = {};
    const attributeAttributeIds = {};
    for (const attr of product.attributes) {
        attributeIds[attr.name] = attr.id;
        attributeAttributeIds[attr.name] = attr.attributeId;
    }
    const attributes = [];
    for (const [attrKey, attrValue] of Object.entries(prod.attributes)) {
        let key = attrKey;
        if (migrateAttributes) {
            if (key == 'vyzn.catalogue.ThermalConductivity')
                key = 'vyzn.catalog.ThermalConductivity';
            else if (key == 'vyzn.catalogue.PriceCHF')
                key = 'vyzn.catalog.PriceCHF';
            else if (key == 'vyzn.catalogue.LayerThickness')
                key = 'vyzn.catalog.LayerThickness';
            else if (key == 'vyzn.catalogue.SectionPercentage')
                key = 'vyzn.catalog.SectionPercentage';
            else if (key == 'vyzn.catalogue.BottomPositionLabel')
                key = 'vyzn.catalog.BottomPositionLabel';
            else if (key == 'vyzn.catalogue.uValue')
                key = 'vyzn.catalog.uValue';
            else if (key == 'vyzn.catalogue.TopPositionLabel')
                key = 'vyzn.catalog.TopPositionLabel';
            else if (key == 'vyzn.catalogue.PositionAgainst')
                key = 'vyzn.catalog.PositionAgainst';
            else if (key == 'vyzn.catalogue.AutomateUValueCalculation')
                key = 'vyzn.catalog.AutomateUValueCalculation';
        }
        if (!attributeIds[key]) {
            console.error(`ATTRIBUTE MISMATCH: Attribute with key ${key} was not found, skipping attribute!`);
            continue;
        }
        attributes.push({
            id: attributeIds[key],
            attributeId: attributeAttributeIds[key],
            productId: product.id,
            value: attrValue
        });
    }
    const updatedProduct = await request.put(new URL('/dbs-catalogue/products/' + id, url).href)
        .send({
        "name": prod.name,
        "productKey": prodKey,
        "category": categoryId,
        "type": prod.type,
        "subType": prod.subType,
        "status": prod.status,
        "description": null,
        "hatchingPattern": prod.hatchingPattern,
        "attributes": attributes
    })
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant);
    if (prod.type == "COMPONENT") {
        await request.put(new URL(`/dbs-catalogue/products/${id}/sectionAttributes`, url).href)
            .send(["644890f2-7c50-475c-91a0-103d44d6583c"])
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
        await request.put(new URL(`/dbs-catalogue/products/${id}/layerAttributes`, url).href)
            .send(["15737593-eb2d-4fdd-ab08-79e06a61490e", "2e043d3e-c8ec-4bca-9c9e-9e1bece51ece"])
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant);
        const associationAttributes = (await request.get(new URL(`/dbs-catalogue/associationAttributes`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')
            .set('x-vyzn-selected-tenant', tenant)).body;
        const associationAttributesDict = {};
        for (const attr of associationAttributes) {
            const associationAttribute = attr;
            associationAttributesDict[associationAttribute.name] = associationAttribute;
        }
        const layerIds = {};
        for (const [layerKey, layerValue] of Object.entries(prod.matrix.layers)) {
            const layer = layerValue;
            const layerAssociationAttributes = [];
            for (let [attrName, attrValue] of Object.entries(layer.associationAttributes)) {
                if (migrateAttributes) {
                    if (attrName == 'vyzn.catalogue.LayerThickness')
                        attrName = 'vyzn.catalog.LayerThickness';
                    else if (attrName == 'vyzn.catalogue.SectionPercentage')
                        attrName = 'vyzn.catalog.SectionPercentage';
                }
                const associationAttribute = associationAttributesDict[attrName];
                if (!associationAttribute) {
                    console.error(`association attribute not found: ${attrName}`);
                    continue;
                }
                layerAssociationAttributes.push({
                    attribute: associationAttribute.id,
                    displayName: associationAttribute.displayName,
                    name: associationAttribute.name,
                    unit: associationAttribute.unit,
                    value: `${attrValue}`
                });
            }
            const newLayer = await request.post(new URL(`/dbs-catalogue/productLayers`, url).href)
                .send({
                "parent": `${id}`,
                "position": parseInt(layerKey)
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            await request.patch(new URL(`/dbs-catalogue/productLayers/${newLayer.body.id}`, url).href)
                .send({
                "id": newLayer.body.id,
                "parent": `${id}`,
                "position": parseInt(layerKey),
                "attributes": layerAssociationAttributes
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            layerIds[layerKey] = newLayer.body.id;
        }
        const sectionIds = {};
        for (const [sectionKey, sectionValue] of Object.entries(prod.matrix.sections)) {
            const section = sectionValue;
            const sectionAssociationAttributes = [];
            for (let [attrName, attrValue] of Object.entries(section.associationAttributes)) {
                if (migrateAttributes) {
                    if (attrName == 'vyzn.catalogue.LayerThickness')
                        attrName = 'vyzn.catalog.LayerThickness';
                    else if (attrName == 'vyzn.catalogue.SectionPercentage')
                        attrName = 'vyzn.catalog.SectionPercentage';
                }
                const associationAttribute = associationAttributesDict[attrName];
                if (!associationAttribute) {
                    console.error(`association attribute not found: ${attrName}`);
                    continue;
                }
                sectionAssociationAttributes.push({
                    attribute: associationAttribute.id,
                    displayName: associationAttribute.displayName,
                    name: associationAttribute.name,
                    unit: associationAttribute.unit,
                    value: `${attrValue}`
                });
            }
            const newSection = await request.post(new URL(`/dbs-catalogue/productSections`, url).href)
                .send({
                "parent": `${id}`,
                "position": parseInt(sectionKey)
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            await request.patch(new URL(`/dbs-catalogue/productSections/${newSection.body.id}`, url).href)
                .send({
                "id": newSection.body.id,
                "parent": `${id}`,
                "position": parseInt(sectionKey),
                "attributes": sectionAssociationAttributes
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            sectionIds[sectionKey] = newSection.body.id;
        }
        for (const [cellKey, cellValue] of Object.entries(prod.matrix.cells)) {
            const cell = cellValue;
            let materialId = null;
            if (materialsCache[cell.materialKey]) {
                materialId = materialsCache[cell.materialKey];
            }
            else {
                let existingProds = await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}/products?type=MATERIAL&query=${encodeURIComponent(cell.materialKey)}&limit=10`, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
                if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == cell.materialKey) {
                    materialId = existingProds.body[0].id;
                    materialsCache[cell.materialKey] = materialId;
                }
            }
            if (!materialId) {
                console.error(`Could not find material: ${cell.materialKey}`);
                continue;
            }
            await request.post(new URL(`/dbs-catalogue/productCellLink`, url).href)
                .send({
                "layer": layerIds["" + cell.layerPosition],
                "section": sectionIds["" + cell.sectionPosition],
                "child": materialId
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
        }
    }
    if (prod.type == "MATERIAL") {
        let lcaProductId = null;
        const lcaCode = prod.linkedReferenceMaterialKey;
        if (lcaCode) {
            if (!lcaProductsCache[lcaCode]) {
                const lcaProducts = await request.get(new URL(`/dbs-catalogue/catalogues/${selectedCatalogueId}/products?type=REFERENCE_MATERIAL&query=${lcaCode}&limit=10`, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
                if (!lcaProducts || !lcaProducts.body || !lcaProducts.body.length || !lcaProducts.body[0] || !lcaProducts.body[0].id) {
                }
                else {
                    lcaProductId = lcaProducts.body[0].id;
                }
                if (!lcaProductId) {
                    console.log(`\tSkipping material because linked LCA product with key '${lcaCode}' could not be found'`);
                }
                lcaProductsCache[lcaCode] = lcaProductId;
            }
            else {
                lcaProductId = lcaProductsCache[lcaCode];
            }
        }
        if (lcaProductId) {
            const existingMaterialListLinks = await request.get(new URL(`/dbs-catalogue/reference-material-links/materials/${product.id}`, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json')
                .set('x-vyzn-selected-tenant', tenant);
            let matchingMaterialListLinkId = null;
            for (const link of existingMaterialListLinks.body) {
                if (link.attributeGroup.id == lcaAttributeGroupId) {
                    matchingMaterialListLinkId = link.id;
                    break;
                }
            }
            if (matchingMaterialListLinkId) {
                const materialListLink = await request.put(new URL(`/dbs-catalogue/reference-material-links/${matchingMaterialListLinkId}`, url).href)
                    .send({
                    "materialId": id,
                    "referenceMaterialId": lcaProductId,
                    "attributeGroupId": lcaAttributeGroupId
                })
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
            }
            else {
                const materialListLink = await request.post(new URL(`/dbs-catalogue/reference-material-links`, url).href)
                    .send({
                    "materialId": id,
                    "referenceMaterialId": lcaProductId,
                    "attributeGroupId": lcaAttributeGroupId
                })
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
            }
        }
    }
}
async function patchVersion(url, tenant, auth, projectId, buildingId, modelVersionId, input, verbose) {
    var _a, _b;
    const matchByAttributeId = 'vyzn.source.GUID';
    const create_missing = false;
    console.info(`started`);
    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);
    console.info(`assert done`);
    const csv = await readCsv(input);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    console.info(`reading done`);
    console.info(`Fetching project ${projectId} building ${buildingId} version ${modelVersionId} ...`);
    console.info(new URL(`/dbs-core/v1/versions/${modelVersionId}/data`, url).href);
    const existingVersion = await request.get(new URL(`/dbs-core/v1/versions/${modelVersionId}/data`, url).href)
        .set('Authorization', authToken)
        .set('x-vyzn-selected-tenant', tenant)
        .set('Accept', 'application/json')
        .set('Accept-Encoding', 'gzip, deflate, br, zstd')
        .set('Accept-Language', 'en-US,en;q=0.9,de;q=0.8')
        .set('Content-Type', 'application/json');
    const values = (_b = (_a = existingVersion.body.elementAttributes) === null || _a === void 0 ? void 0 : _a[matchByAttributeId]) === null || _b === void 0 ? void 0 : _b.values;
    const valueCount = values ? Object.keys(values).length : 0;
    console.info(`Done. ${valueCount} elements found.`);
    console.info(`Transforming to target structure...`);
    let transformed = {};
    const idLookup = {};
    const elementAttributes = existingVersion.body.elementAttributes;
    Object.entries(elementAttributes).forEach(([_, attribute]) => {
        const attributeName = attribute.name;
        const values = attribute.values;
        if (values) {
            Object.entries(values).forEach(([id, value]) => {
                if (!transformed[attributeName]) {
                    transformed[attributeName] = {};
                }
                transformed[attributeName][id] = `${value}`;
                if (attributeName === matchByAttributeId) {
                    idLookup[value] = id;
                }
            });
        }
    });
    console.info(`Done.`);
    transformed = {};
    console.info(`Processing CSV ...`);
    for (const row of csv) {
        const key = row[matchByAttributeId];
        if (!key) {
            console.error(`There are rows in the CSV with a missing value in mandatory column '${matchByAttributeId}'.`);
            return;
        }
        let id = idLookup[key];
        if (!id) {
            if (create_missing) {
                console.warn(`Record with key '${matchByAttributeId}' = '${key}' not found, creating it`);
                const createdElement = await request.post(new URL(`/dbs-core-v2/projects/${projectId}/buildings/${buildingId}/versions/${modelVersionId}/elements/space`, url).href)
                    .send({
                    "name": `New ${key}`,
                    "area": 0,
                    "height": 0,
                    "floor": "",
                    "isHeated": false,
                    "minergieClassification": null,
                    "minergieEcoClassification": null,
                    "sia3802015Classification": null,
                    "sia4162003Classification": null,
                    "sia20402017Classification": null,
                    "sia38012016Classification": null,
                    "additionalElementAttributeValues": []
                })
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')
                    .set('x-vyzn-selected-tenant', tenant);
                id = createdElement.body.id;
                idLookup[key] = id;
                console.warn(`Element created with ID=${id}`);
            }
            else {
                console.warn(`Record with key '${matchByAttributeId}' = '${key}' not found, skipping it`);
            }
        }
        else {
            console.info(`Record with key '${matchByAttributeId}' = '${key}' found`);
        }
        for (const attributeName of Object.keys(row)) {
            let newValue = row[attributeName];
            if (!transformed[attributeName])
                transformed[attributeName] = {};
            transformed[attributeName][id] = `${newValue}`;
        }
    }
    console.info(`Done. ${csv.length} rows found.`);
    if (verbose)
        console.debug(JSON.stringify(transformed));
    console.info(`Patching version ...`);
    const updatedVersion = await request.post(new URL(`/dbs-core/v1/versions/${modelVersionId}/coresynccommand`, url).href)
        .send({
        "historyPointId": modelVersionId,
        "startSyncFromCatalog": false,
        "historyPointConfigChanges": transformed
    })
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
        .set('x-vyzn-selected-tenant', tenant);
    console.info(`Done.`);
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
async function convertOekobaudat(input, output, verbose) {
    await assertFile(input);
    console.log(`Converting oekobaudat CSV from ${input} to ${output}`);
    const raw = await fs.readFile(input, { encoding: 'latin1', flag: 'r' });
    const lines = raw.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        console.error('Error: CSV file must have at least a header and one data row');
        process.exit(1);
    }
    const header = lines[0].split(';').map(col => col.trim());
    if (verbose) {
        console.log(`Found ${header.length} columns: ${header.slice(0, 10).join(', ')}${header.length > 10 ? '...' : ''}`);
    }
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        const row = {};
        for (let j = 0; j < header.length; j++) {
            const value = values[j] ? values[j].trim() : '';
            row[header[j]] = value;
        }
        data.push(row);
    }
    if (verbose) {
        console.log(`Parsed ${data.length} data rows`);
    }
    const transformedData = {
        fileFormatVersion: "1.1.0",
        exportTimestamp: new Date().toISOString(),
        source: "oekobaudat.de",
        products: {}
    };
    const productGroups = new Map();
    for (const row of data) {
        const uuid = row['UUID'];
        if (!uuid)
            continue;
        if (!productGroups.has(uuid)) {
            productGroups.set(uuid, {
                uuid: uuid,
                version: row['Version'],
                nameDe: row['Name (de)'],
                nameEn: row['Name (en)'],
                categoryOriginal: row['Kategorie (original)'],
                categoryEn: row['Kategorie (en)'],
                conformity: row['Konformitaet'],
                backgroundDatabase: row['Hintergrunddatenbank(en)'],
                countryCode: row['Laenderkennung'],
                type: row['Typ'],
                referenceYear: row['Referenzjahr'],
                validUntil: row['Gueltig bis'],
                url: row['URL'],
                declarationOwner: row['Declaration owner'],
                publishedOn: row['Veroeffentlicht am'],
                registrationNumber: row['Registrierungsnummer'],
                registrationOffice: row['Registrierungsstelle'],
                predecessorUuid: row['UUID des Vorgaengers'],
                predecessorVersion: row['Version des Vorgaengers'],
                predecessorUrl: row['URL des Vorgaengers'],
                referenceSize: row['Bezugsgroesse'],
                referenceUnit: row['Bezugseinheit'],
                referenceFlowUuid: row['Referenzfluss-UUID'],
                referenceFlowName: row['Referenzfluss-Name'],
                bulkDensity: row['Schuettdichte (kg/m3)'],
                areaWeight: row['Flaechengewicht (kg/m2)'],
                rawDensity: row['Rohdichte (kg/m3)'],
                layerThickness: row['Schichtdicke (m)'],
                yield: row['Ergiebigkeit (m2)'],
                lengthWeight: row['Laengengewicht (kg/m)'],
                pieceWeight: row['Stueckgewicht (kg)'],
                conversionFactor: row['Umrechungsfaktor auf 1kg'],
                biogenicCarbonContent: row['biogener Kohlenstoffgehalt in kg'],
                biogenicCarbonContentPackaging: row['biogener Kohlenstoffgehalt (Verpackung) in kg'],
                lcaModules: []
            });
        }
        const product = productGroups.get(uuid);
        const module = {
            module: row['Modul'],
            scenario: row['Szenario'],
            scenarioDescription: row['Szenariobeschreibung'],
            gwp: row['GWP'],
            odp: row['ODP'],
            pocp: row['POCP'],
            ap: row['AP'],
            ep: row['EP'],
            adpe: row['ADPE'],
            adpf: row['ADPF'],
            pere: row['PERE'],
            perm: row['PERM'],
            pert: row['PERT'],
            penre: row['PENRE'],
            penrm: row['PENRM'],
            penrt: row['PENRT'],
            sm: row['SM'],
            rsf: row['RSF'],
            nrsf: row['NRSF'],
            fw: row['FW'],
            hwd: row['HWD'],
            nhwd: row['NHWD'],
            rwd: row['RWD'],
            cru: row['CRU'],
            mfr: row['MFR'],
            mer: row['MER'],
            eee: row['EEE'],
            eet: row['EET'],
            apA2: row['AP (A2)'],
            gwpTotalA2: row['GWPtotal (A2)'],
            gwpBiogenicA2: row['GWPbiogenic (A2)'],
            gwpFossilA2: row['GWPfossil (A2)'],
            gwpLulucA2: row['GWPluluc (A2)'],
            etpfwA2: row['ETPfw (A2)'],
            pmA2: row['PM (A2)'],
            epMarineA2: row['EPmarine (A2)'],
            epFreshwaterA2: row['EPfreshwater (A2)'],
            epTerrestrialA2: row['EPterrestrial (A2)'],
            htpCA2: row['HTPc (A2)'],
            htpNcA2: row['HTPnc (A2)'],
            irpA2: row['IRP (A2)'],
            sopA2: row['SOP (A2)'],
            odpA2: row['ODP (A2)'],
            pocpA2: row['POCP (A2)'],
            adpfA2: row['ADPF (A2)'],
            adpeA2: row['ADPE (A2)'],
            wdpA2: row['WDP (A2)']
        };
        product.lcaModules.push(module);
    }
    for (const [uuid, product] of productGroups) {
        const productKey = `oekobaudat_${uuid}`;
        transformedData.products[productKey] = {
            name: product.nameEn || product.nameDe,
            type: "REFERENCE_MATERIAL",
            subType: null,
            status: "approved",
            hatchingPattern: null,
            linkedReferenceMaterialKey: null,
            categoryPath: `Alle > REFERENZ-MATERIALIEN > oekobaudat.de > ${(product.categoryOriginal || product.categoryEn).replace(/'/g, '').replace(/\//g, ' > ')}`,
            matrix: {
                layers: {},
                sections: {},
                cells: {}
            },
            attributes: {
                "vyzn.source.ExternalId": uuid,
                "vyzn.catalogue.de.OEBD.UUID": uuid,
                "vyzn.catalogue.Owner": product.declarationOwner || null,
                "vyzn.catalogue.de.OEBD.Version": product.version || null,
                "vyzn.catalogue.de.OEBD.Density": parseFloat(product.rawDensity) || null,
                "vyzn.catalogue.de.OEBD.BulkDensity": parseFloat(product.bulkDensity) || null,
                "vyzn.catalogue.de.OEBD.AreaWeight": parseFloat(product.areaWeight) || null,
                "vyzn.catalogue.de.OEBD.LayerThickness": parseFloat(product.layerThickness) || null,
                "vyzn.catalogue.de.OEBD.LengthWeight": parseFloat(product.lengthWeight) || null,
                "vyzn.catalogue.de.OEBD.PieceWeight": parseFloat(product.pieceWeight) || null,
                "vyzn.catalogue.de.OEBD.ConversionFactor": parseFloat(product.conversionFactor) || null,
                "vyzn.catalogue.de.OEBD.BiogenicCarbonContent": parseFloat(product.biogenicCarbonContent) || null,
                "vyzn.catalogue.de.OEBD.BiogenicCarbonContentPackaging": parseFloat(product.biogenicCarbonContentPackaging) || null,
                "vyzn.catalogue.de.OEBD.ReferenceYear": parseInt(product.referenceYear) || null,
                "vyzn.catalogue.de.OEBD.ValidUntil": product.validUntil || null,
                "vyzn.catalogue.de.OEBD.CountryCode": product.countryCode || null,
                "vyzn.catalogue.de.OEBD.DeclarationOwner": product.declarationOwner || null,
                "vyzn.catalogue.de.OEBD.RegistrationNumber": product.registrationNumber || null,
                "vyzn.catalogue.de.OEBD.RegistrationOffice": product.registrationOffice || null,
                "vyzn.catalogue.de.OEBD.URL": product.url || null
            },
            lcaModules: product.lcaModules
        };
    }
    if (verbose) {
        console.log(`Transformed ${productGroups.size} unique products`);
    }
    await fs.writeFile(output, JSON.stringify(transformedData, null, 2), { encoding: 'utf8' });
    console.log(`Successfully converted oekobaudat data to ${output}`);
}
main();
//# sourceMappingURL=main.js.map