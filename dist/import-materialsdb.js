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

    const singleLayer = true; //only one layer considered

    const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

    let kbobLookup = {};
    const kbobLookupCsv = await readCsv('data/materialsdb_kbob2016_lookuptable.csv');

    const groupTranslation = await readCsv('data/material_group_translation.csv');

    
    for (const row of kbobLookupCsv) {
        if (row.KBOB_ID)
            kbobLookup[row.GUID] = row.KBOB_ID;
    }


    const producerIndexResponse = await request.get('http://www.materialsdb.org/download/ProducerIndex.xml')
        .set('Accept', 'application/xhtml+xml,application/xml;')
        .responseType('blob');

    const producerIndex = await xml2js.parseStringPromise(producerIndexResponse.body);

    const selectedCatalogue = await request.get(new URL('/catalogues/selected', url).href)
        .set('Authorization', authToken)
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json');

    const selectedCatalogueId = selectedCatalogue.body.id;


    const types = await request.get(new URL('/types', url).href)
        .set('Authorization', authToken)
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

    const attributeGroups = await request.get(new URL('/attributeGroups', url).href)
        .set('Authorization', authToken)
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

    let counterCom = 0;
    let resumeComp = false;
    let resumefromComp = "Soprema AG"
    for (const company of producerIndex.MaterialsDBIndex.company) {
        if (company.$.name == resumefromComp) {
            resumeComp = true;
        }
        
        if (resumeComp == false) {
            continue;
        } 

        counterCom++;
        console.error("C",counterCom,"/",producerIndex.MaterialsDBIndex.company.length)

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

        const producerCategory = await request.post(new URL('/categories', url).href)
            .send({
            "name": company.$.name,
            "catalogue": selectedCatalogueId,
            "parent": category,
            "type": '8edda477-9616-11ec-9e4b-c3c59084e5ec'
        })
            .set('Authorization', authToken)
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5')
            .set('Content-Type', 'application/json');
            
        const producerCategoryId = producerCategory.body.id;
        

        let counterMat = 0;

        for (const material of producerData.materials.material) {

            const name = getTranslatedString(material.information[0].names[0], "name", "de");
            const productName = `${name} (${company.$.name})`;

            counterMat++;
            console.error(" M",counterMat,"/",producerData.materials.material.length)
            console.log(`\tProcessing entry '${name}'`);


            if (name.includes("(old)")) {
                console.log(`\tSkipped '${productName}' - old`);
                continue;
            }

            try {

                const owner = "";
                const license = "";
                const produ = company.$.name;

                let group;
                if (material.information[0].$) {
                    group = material.information[0].$.group;

                    for (const row of groupTranslation) {
                        if (row.mat_en == group)
                            group = row.mat_de;
                    }
                }

                let matPattern;
                if (group == "Wasserdicht"	|| group == "Dampfdicht" || group == "Folie") {
                    matPattern = "barrier-layer";
                } else if (group == "Mauerwerk"	|| group == "Stein") {
                    matPattern = "brick";
                } else if (group == "Verputz"	|| group == "Mörtel") {
                    matPattern = "plaster";
                } else if (group == "Beton") {
                    matPattern = "concrete";
                } else if (group == "Glas") {
                    matPattern = "glass";
                } else if (group == "Metall") {
                    matPattern = "metal";
                } else if (group == "Erdreich") {
                    matPattern = "natural-stone";
                } else if (group == "Kunststoff") {
                    matPattern = "plastics";
                } else if (group == "Holz") {
                    matPattern = "wood-material";
                } else if (group == "Dämmung") {
                    if (name.includes("XPS") || name.includes("PIR") || name.includes("PUR")) {
                        matPattern = "xps-pir-pur";
                    } else if (name.includes("Steinwolle")) {
                        matPattern = "rockwool";
                    } else {matPattern = "isolation-md"}
                } else {matPattern = "empty"}

                let sourceEPE = material.$.id+ " - materialsdb.org";

                if (material.$.type != "simple") {
                    if (verbose)
                        console.log(`Skipping entry that is not of type 'simple'`);
                    continue;
                }
                
                // const explanation = material.information[0].explanations ? getTranslatedString(material.information[0].explanations[0], "explanation", "de") : null;

                for (const layer of material.layers[0].layer) {

                    
                    let thick, density, therm_capa, lambda, fireclass, fireresis, firecomb, firesmoke, firereact;
                    if (layer.geometry && layer.geometry[0].$) {
                        thick = layer.geometry[0].$.thick;
                        // length = layer.geometry[0].$.length;
                        // width = layer.geometry[0].$.width;
                    }
                    if (layer.physical && layer.physical[0].$) {
                        density = layer.physical[0].$.density;
                    }
                    if (layer.security && layer.security[0].$) {
                        fireclass = layer.security[0].$.FireClass;
                        fireresis = layer.security[0].$.FireResis;
                        firecomb = layer.security[0].$.FireComb;
                        firesmoke = layer.security[0].$.FireSmoke;
                        firereact = layer.security[0].$.FireReact;
                    }
                    if (layer.thermal && layer.thermal[0].$) {
                        therm_capa = layer.thermal[0].$.therm_capa;
                        lambda = layer.thermal[0].$.lambda_value;
                    }


                    let options = [];
                    for (const l of material.layers[0].layer) {
                        if (l.geometry && l.geometry[0].$) {
                            // console.log("LAYER "+layer.geometry[0].$.thick)
                            // console.log("L "+l.geometry[0].$.thick)
                            options.push(l.geometry[0].$.thick);
                        }
                        
                    }


                    console.log("\t Creating product...")
                    const newProduct = await request.post(new URL('/products', url).href)
                        .send({
                        "name": productName,
                        "productKey": productName,
                        "category": producerCategoryId,
                        "type": productType
                    })
                        .set('Authorization', authToken)
                        .set('Accept', 'application/, json')
                        .set('Accept-Encoding', 'gzip, deflate, br')
                        .set('Accept-Language', 'en-US,en;q=0.5')
                        .set('Content-Type', 'application/json');

                    const id = newProduct.body.id;

                    breakme: {
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
                        if (!lcaCode) {
                            console.log(`\tno LCA data for  '${name}'`);
                            //console.log(`\tSkipping material due to missing LCA code for database '${lcaDatabase}'`);
                            break breakme;
                        }
                        if (!kbobLookup[lcaCode]) {
                            //console.log(`\tSkipping material because LCA key '${lcaCode}' could not be found in lookup table'`);
                            console.log(`\tno LCA data for  '${name}'`);
                            break breakme;
                        }
                        let lcaProductId = null;
                        if (!lcaProductsCache[lcaCode]) {
                            const prefixes = ["KBOB2022", "KBOB2016"];
                            for (const prefix of prefixes) {
                                const lcaProductName = `${prefix}-${kbobLookup[lcaCode]}`;
                                const lcaProducts = await request.get(new URL(`/catalogues/${selectedCatalogueId}/products?type=REFERENCE_MATERIAL&productKey=${lcaProductName}&limit=10`, url).href)
                                    .set('Authorization', authToken)
                                    .set('Content-Type', 'application/json')
                                    .set('Accept', 'application/, json')
                                    .set('Accept-Encoding', 'gzip, deflate, br')
                                    .set('Accept-Language', 'en-US,en;q=0.5')
                                    .set('Content-Type', 'application/json');
                                if (!lcaProducts || !lcaProducts.body || !lcaProducts.body.length || !lcaProducts.body[0] || !lcaProducts.body[0].id) {
                                    console.log(`no LCA data for  '${name}'`);
                                    break breakme;
                                }
                                lcaProductId = lcaProducts.body[0].id;
                                break;
                            }

                            if (!lcaProductId) {
                                //console.log(`\tSkipping material because linked LCA product with key '${lcaCode}' could not be found'`);
                                console.log(`\tno LCA data for  '${name}'`);
                                break breakme;
                            }
                            lcaProductsCache[lcaCode] = lcaProductId;
                        }
                        else {
                            lcaProductId = lcaProductsCache[lcaCode];
                        }

                        const materialListLink = await request.post(new URL(`/reference-material-links`, url).href)
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

                    if (options)
                        if (options != []) {
                            options = [...new Set(options)];
                        }
                        pushAttr("vyzn.catalogue.Thickness", options);
                    if (group)
                        pushAttr("vyzn.catalogue.Category", group);
                    if (density)
                        pushAttr("vyzn.catalogue.Density", parseFloat(density));
                    if (therm_capa)
                        pushAttr("vyzn.catalogue.ThermalCapacity", parseFloat(therm_capa));
                    if (lambda)
                        pushAttr("vyzn.catalog.ThermalConductivity", parseFloat(lambda));
                    if (owner)
                        pushAttr("vyzn.catalogue.Owner", owner);
                    if (produ)
                        pushAttr("vyzn.catalogue.Producer", produ);
                    if (license)
                        pushAttr("vyzn.catalogue.License", license);
                    if (sourceEPE)
                        pushAttr("vyzn.catalogue.SourceEPE", sourceEPE);
                    if (fireclass)
                        pushAttr("vyzn.catalogue.FireClass", fireclass);
                    if (firecomb)
                        pushAttr("vyzn.catalogue.FireComb", firecomb);
                    if (fireresis)
                        pushAttr("vyzn.catalogue.FireResis", fireresis);
                    if (firesmoke)
                        pushAttr("vyzn.catalogue.FireSmoke", firesmoke);
                    if (firereact)
                        pushAttr("vyzn.catalogue.FireReact", firereact);

                        

                    const updatedProduct = await request.put(new URL('/products/' + id, url).href)
                        .send({
                        "name": productName,
                        "productKey": productName,
                        "category": producerCategoryId,
                        "type": productType,
                        "status": "approved",
                        "description": null,
                        "hatchingPattern": matPattern,
                        "attributes": attributes
                    })
                        .set('Authorization', authToken)
                        .set('Accept', 'application/, json')
                        .set('Accept-Encoding', 'gzip, deflate, br')
                        .set('Accept-Language', 'en-US,en;q=0.5')
                        .set('Content-Type', 'application/json');


                    if (singleLayer)
                        break;
                }
            }
             catch (error) {
                console.log(`Failed to process entry '${name}'. Error:`, error.message);
                continue;  // Skips the rest of the loop and moves to the next material
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