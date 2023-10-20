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
        .option('-d, --diff', 'Perform diff only')
        .action((o) => {
        importProducts(o.input, o.url, o.auth, o.category, o.verbose, o.diff);
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
        .requiredOption('-a, --auth <file>', 'The file containing the auth token')
        .option('-v, --verbose', 'More detailed console output')
        .option('-d, --diff', 'Perform diff only')
        .action((o) => {
        importCatalog(o.input, o.url, o.auth, o.verbose, o.diff);
    });
    program.parse();
}
async function importProducts(input, url, auth, category, verbose, diff) {
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
            let existingProds = await request.get(new URL(`/catalogues/${selectedCatalogueId}/products?type=REFERENCE_MATERIAL&query=${row.ProductKey}&limit=10`, url).href)
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
            if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == row.ProductKey) {
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
                                if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit")) {
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
                if (!id) {
                    console.log(`${row.ProductKey} Could not find attribute ${attributeName}`);
                    continue;
                }
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
const createdPathsCache = {};
const lcaProductsCache = {};
const materialsCache = {};
async function createCategoryPath(categoryPath, catalogueId, hierarchy, typeId, url, auth) {
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
                const newCat = (await request.post(new URL('/categories', url).href)
                    .send({
                    "catalogue": catalogueId,
                    "name": paths[i],
                    "parent": (currentNode != null ? currentNode.id : lastCatId),
                    "type": typeId,
                })
                    .set('Authorization', auth)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json')).body;
                lastCatId = newCat.id;
                createdPathsCache[currentPathKey] = newCat;
            }
            currentNode = null;
        }
    }
    const leafCategoryId = lastCatId ? lastCatId : currentNode.id;
    return leafCategoryId;
}
async function importCatalog(input, url, auth, verbose, diff) {
    const lcaAttributeGroup = 'Ökobilanz';
    await assertFile(input);
    await assertUrl(url);
    await assertFile(auth);
    const componentsFile = await fs.readFile(input, { encoding: 'utf8', flag: 'r' });
    const componentsObj = JSON.parse(componentsFile);
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    const selectedCatalogue = await request.get(new URL('/catalogues/selected', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    const selectedCatalogueId = selectedCatalogue.body.id;
    const hierarchy = (await request.get(new URL(`/catalogues/${selectedCatalogueId}`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')).body;
    const types = (await request.get(new URL('/types', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')).body;
    const typesDict = {};
    for (const t of types)
        typesDict[t.name] = t;
    const productTypeNameToCategoryTypeIdMap = {
        "REFERENCE_MATERIAL": typesDict["MAT"].id,
        "MATERIAL": typesDict["MAT"].id,
        "COMPONENT": typesDict["BT"].id
    };
    const attributeGroups = await request.get(new URL('/attributeGroups', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    let lcaAttributeGroupId = null;
    for (const g of attributeGroups.body) {
        if (g.name == lcaAttributeGroup) {
            lcaAttributeGroupId = g.id;
            break;
        }
    }
    if (!lcaAttributeGroupId)
        throw `Could not find attribute group with name ${lcaAttributeGroup}`;
    await importProductsOfType(componentsObj.products, "COMPONENT", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, authToken, verbose, diff);
    return;
}
let anchorFound = false;
async function importProductsOfType(products, type, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, auth, verbose, diff) {
    for (const [key, value] of Object.entries(products)) {
        let prod = value;
        if (prod.type != type)
            continue;
        await importSingleProduct(prod, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, auth, verbose, diff);
    }
}
async function importSingleProduct(prod, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, authToken, verbose, diff) {
    const categoryType = productTypeNameToCategoryTypeIdMap[prod.type];
    const categoryId = await createCategoryPath(prod.categoryPath, selectedCatalogueId, hierarchy, categoryType, url, authToken);
    if (!categoryId)
        console.error(`missing category for product: ${prod.name}`);
    let product = null;
    try {
        let existingProdId = null;
        let existingProds = await request.get(new URL(`/catalogues/${selectedCatalogueId}/products?type=${prod.type}&query=${encodeURIComponent(prod.name)}&limit=10`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == prod.name) {
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
                console.log(`${prod.name} Updating existing product`);
            }
        }
    }
    catch (error) {
        console.log(error);
    }
    if (product && prod.type == "COMPONENT") {
        console.log(`${prod.name} Deleting existing product since it is a component`);
        await request.del(new URL('/products/' + product.id, url).href)
            .send({
            "name": prod.name,
            "productKey": prod.name,
            "category": categoryId,
            "type": prod.type
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        product = null;
    }
    if (!product) {
        const newProd = await request.post(new URL('/products', url).href)
            .send({
            "name": prod.name,
            "productKey": prod.name,
            "category": categoryId,
            "type": prod.type
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        product = newProd.body;
        console.log(`${prod.name} Creating new product`);
    }
    const id = product.id;
    const attributeIds = {};
    for (const attr of product.attributes) {
        attributeIds[attr.name] = attr.id;
    }
    const attributes = [];
    for (const [attrKey, attrValue] of Object.entries(prod.attributes)) {
        attributes.push({
            id: attributeIds[attrKey],
            value: attrValue
        });
    }
    const updatedProduct = await request.put(new URL('/products/' + id, url).href)
        .send({
        "name": prod.name,
        "productKey": prod.name,
        "category": categoryId,
        "type": prod.type,
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
    if (prod.type == "COMPONENT") {
        await request.put(new URL(`/products/${id}/sectionAttributes`, url).href)
            .send(["644890f2-7c50-475c-91a0-103d44d6583c"])
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        await request.put(new URL(`/products/${id}/layerAttributes`, url).href)
            .send(["15737593-eb2d-4fdd-ab08-79e06a61490e", "2e043d3e-c8ec-4bca-9c9e-9e1bece51ece"])
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        const associationAttributes = (await request.get(new URL(`/associationAttributes`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json')).body;
        const associationAttributesDict = {};
        for (const attr of associationAttributes) {
            const associationAttribute = attr;
            associationAttributesDict[associationAttribute.name] = associationAttribute;
        }
        const layerIds = [];
        for (const [layerKey, layerValue] of Object.entries(prod.matrix.layers)) {
            const layer = layerValue;
            const layerAssociationAttributes = [];
            for (const [attrName, attrValue] of Object.entries(layer.associationAttributes)) {
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
            const newLayer = await request.post(new URL(`/productLayers`, url).href)
                .send({
                "parent": `${id}`,
                "position": parseInt(layerKey)
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
            await request.patch(new URL(`/productLayers/${newLayer.body.id}`, url).href)
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
                .set('Content-Type', 'application/json');
            layerIds.push(newLayer.body.id);
        }
        const sectionIds = [];
        for (const [sectionKey, sectionValue] of Object.entries(prod.matrix.sections)) {
            const section = sectionValue;
            const sectionAssociationAttributes = [];
            for (const [attrName, attrValue] of Object.entries(section.associationAttributes)) {
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
            const newSection = await request.post(new URL(`/productSections`, url).href)
                .send({
                "parent": `${id}`,
                "position": parseInt(sectionKey)
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
            await request.patch(new URL(`/productSections/${newSection.body.id}`, url).href)
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
                .set('Content-Type', 'application/json');
            sectionIds.push(newSection.body.id);
        }
        for (const [cellKey, cellValue] of Object.entries(prod.matrix.cells)) {
            const cell = cellValue;
            let materialId = null;
            if (materialsCache[cell.materialKey]) {
                materialId = materialsCache[cell.materialKey];
            }
            else {
                let existingProds = await request.get(new URL(`/catalogues/${selectedCatalogueId}/products?type=MATERIAL&query=${encodeURIComponent(cell.materialKey)}&limit=10`, url).href)
                    .set('Authorization', authToken)
                    .set('Content-Type', 'application/json')
                    .set('Accept', 'application/, json')
                    .set('Accept-Encoding', 'gzip, deflate, br')
                    .set('Accept-Language', 'en-US,en;q=0.5')
                    .set('Content-Type', 'application/json');
                if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == cell.materialKey) {
                    materialId = existingProds.body[0].id;
                    materialsCache[cell.materialKey] = materialId;
                }
            }
            if (!materialId) {
                console.error(`Could not find material: ${materialId}`);
                continue;
            }
            await request.post(new URL(`/productCellLink`, url).href)
                .send({
                "layer": layerIds[cell.layerPosition],
                "section": sectionIds[cell.sectionPosition],
                "child": materialId
            })
                .set('Authorization', authToken)
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/, json')
                .set('Accept-Encoding', 'gzip, deflate, br')
                .set('Accept-Language', 'en-US,en;q=0.5')
                .set('Content-Type', 'application/json');
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