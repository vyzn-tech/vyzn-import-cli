import { promises as fs } from 'fs';
import request from 'superagent';
import { URL } from 'url';
import xml2js from 'xml2js';
import { parseCSV } from 'csv-load-sync';
export async function importMaterialsDb(url, auth, category, verbose) {
    const productType = 'MATERIAL';
    const categoryType = 'MAT';
    const lcaAttributeGroup = 'Ökobilanz';
    const lcaDatabase = 'dbKBOB';
    const lcaVersionNames = ['2016', '2014', '2011'];
    const singleLayer = true;
    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
    let kbobLookup = {};
    const kbobLookupCsv = await readCsv('data/materialsdb_kbob2016_lookuptable.csv');
    for (const row of kbobLookupCsv) {
        if (row.KBOB_ID)
            kbobLookup[row.GUID] = row.KBOB_ID;
    }
    const producerIndexResponse = await request.get('http://www.materialsdb.org/download/ProducerIndex.xml')
        .set('Accept', 'application/xhtml+xml,application/xml;')
        .responseType('blob');
    const producerIndex = await xml2js.parseStringPromise(producerIndexResponse.body);
    const catalogues = await request.get(new URL('/dbs-catalogue/v1/catalogues', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    const selectedCatalogueId = catalogues.body.selectedCatalogueId;
    const types = await request.get(new URL('/dbs-catalogue/v1/types', url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');
    let categoryTypeId = null;
    for (const t of types.body) {
        if (t.name == categoryType) {
            categoryTypeId = t.id;
            break;
        }
    }
    if (!categoryTypeId)
        throw `Could not find category with name ${categoryType}`;
    const attributeGroups = await request.get(new URL('/dbs-catalogue/v1/attributeGroups', url).href)
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
    const lcaProductsCache = {};
    const nameCache = {};
    let continuation = false;
    for (const company of producerIndex.MaterialsDBIndex.company) {
        if (company.$.name == "Swisspor AG")
            continuation = true;
        if (!continuation)
            continue;
        if (company.$.active !== "true") {
            console.log(`Skipping '${company.$.name}'`);
            continue;
        }
        if (verbose)
            console.log(`Processing '${company.$.name}'`);
        const producerDataResponse = await request.get(company.$.href)
            .set('Accept', 'application/xhtml+xml,application/xml;')
            .responseType('blob');
        if (verbose)
            console.log(`\tFetched '${company.$.href}'`);
        const producerData = await xml2js.parseStringPromise(producerDataResponse.body);
        const producerCategory = await request.post(new URL('/dbs-catalogue/v1/categories', url).href)
            .send({
            "name": company.$.name,
            "catalogue": selectedCatalogueId,
            "parent": category,
            "type": '8edda477-9616-11ec-9e4b-c3c59084e5ec'
        })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
        const producerCategoryId = producerCategory.body.id;
        for (const material of producerData.materials.material) {
            if (material.$.type != "simple") {
                if (verbose)
                    console.log(`Skipping entry that is not of type 'simple'`);
                continue;
            }
            const matId = material.$.id;
            const name = getTranslatedString(material.information[0].names[0], "name", "de");
            const explanation = material.information[0].explanations ? getTranslatedString(material.information[0].explanations[0], "explanation", "de") : null;
            if (name == 'Bacstein CellitPlus' || name == 'swissporPUR Hartschaum unkaschiert')
                continue;
            console.log(`\tProcessing entry '${name}'`);
            let numLayers = material.layers[0].layer.length;
            let idx = 0;
            for (const layer of material.layers[0].layer) {
                let thick, length, width, density, therm_capa, lambda;
                if (layer.geometry && layer.geometry[0].$) {
                    thick = layer.geometry[0].$.thick;
                    length = layer.geometry[0].$.length;
                    width = layer.geometry[0].$.width;
                }
                if (layer.physical && layer.physical[0].$) {
                    density = layer.physical[0].$.density;
                }
                if (layer.thermal && layer.thermal[0].$) {
                    therm_capa = layer.thermal[0].$.therm_capa;
                    lambda = layer.thermal[0].$.lambda_value;
                }
                let nameSuffix = "";
                if (!singleLayer && numLayers > 1) {
                    if (thick && length && width)
                        nameSuffix = ` ${thick}/${length}/${width}`;
                    else
                        nameSuffix = ` ${idx + 1}`;
                }
                let lcaCode = null;
                if (layer.lca) {
                    for (const lcaEntry of layer.lca) {
                        if (lcaEntry && lcaEntry.$ && lcaEntry.$.database == lcaDatabase && lcaEntry.lcaversion && lcaEntry.lcaversion.length) {
                            for (const lcaVersion of lcaEntry.lcaversion) {
                                if (lcaVersion && lcaVersion.$ && lcaVersionNames.includes(lcaVersion.$.id)) {
                                    lcaCode = lcaVersion.$.code;
                                    if (lcaVersionNames[0] == lcaVersion.$.id)
                                        break;
                                }
                            }
                        }
                    }
                }
                let lcaProductId = null;
                if (lcaCode && kbobLookup[lcaCode]) {
                    if (!lcaProductsCache[lcaCode]) {
                        const prefixes = ["KBOB2022", "KBOB2016"];
                        for (const prefix of prefixes) {
                            const lcaProductName = lcaCode.replace('{', '').replace('}');
                            const lcaProducts = await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}/products?type=REFERENCE_MATERIAL&productKey=${lcaProductName}&limit=10`, url).href)
                                .set('Authorization', authToken)
                                .set('Content-Type', 'application/json')
                                .set('Accept', 'application/, json')
                                .set('Accept-Encoding', 'gzip, deflate, br')
                                .set('Accept-Language', 'en-US,en;q=0.5')
                                .set('Content-Type', 'application/json');
                            if (!lcaProducts || !lcaProducts.body || !lcaProducts.body.length || !lcaProducts.body[0] || !lcaProducts.body[0].id) {
                                continue;
                            }
                            lcaProductId = lcaProducts.body[0].id;
                            break;
                        }
                        if (!lcaProductId) {
                        }
                        lcaProductsCache[lcaCode] = lcaProductId;
                    }
                    else {
                        lcaProductId = lcaProductsCache[lcaCode];
                    }
                }
                let productName = `${name}${nameSuffix} (${company.$.name})`;
                const productNameLowerCase = productName.toLowerCase();
                if (!nameCache[productNameLowerCase]) {
                    nameCache[productNameLowerCase] = 1;
                }
                else {
                    nameCache[productNameLowerCase] = nameCache[productNameLowerCase] + 1;
                    productName = `${productName} (${nameCache[productNameLowerCase]})`;
                }
                const newProduct = await request.post(new URL('/dbs-catalogue/v1/products', url).href)
                    .send({
                    "name": productName,
                    "productKey": productName,
                    "category": producerCategoryId,
                    "type": productType
                })
                    .set('Authorization', authToken)
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
                function pushAttr(attributeName, value) {
                    let attributeId = attributeIds[attributeName];
                    if (!attributeId) {
                        console.log(`\tCould not find attribute with name ${attributeName}`);
                    }
                    attributes.push({
                        id: attributeId,
                        value: value
                    });
                }
                if (thick)
                    pushAttr("vyzn.catalogue.Thickness", parseFloat(thick));
                if (width)
                    pushAttr("vyzn.catalogue.Width", parseFloat(width));
                if (density)
                    pushAttr("vyzn.catalogue.Density", parseFloat(density));
                if (therm_capa)
                    pushAttr("vyzn.catalogue.ThermalCapacity", parseFloat(therm_capa));
                if (lambda)
                    pushAttr("vyzn.catalogue.ThermalConductivity", parseFloat(lambda));
                const updatedProduct = await request.put(new URL('/dbs-catalogue/v1/products/' + id, url).href)
                    .send({
                    "name": productName,
                    "productKey": matId,
                    "category": producerCategoryId,
                    "type": productType,
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
                if (lcaProductId) {
                    const materialListLink = await request.post(new URL(`/dbs-catalogue/v1/reference-material-links`, url).href)
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
                        .set('Content-Type', 'application/json');
                }
                idx++;
                if (singleLayer)
                    break;
            }
        }
    }
}
function getTranslatedString(obj, attribute, lang) {
    let value = obj[attribute][0];
    if (typeof value !== "string") {
        value = null;
        for (const translatedObj of obj[attribute]) {
            if (translatedObj.$ && translatedObj.$.lang === lang && translatedObj._) {
                value = translatedObj._;
                break;
            }
        }
        if (!value)
            value = obj[attribute][0]._;
    }
    return value;
}
async function readCsv(path) {
    const raw = await fs.readFile(path, { encoding: 'utf8', flag: 'r' });
    return parseCSV(raw);
}
//# sourceMappingURL=import-materialsdb.js.map