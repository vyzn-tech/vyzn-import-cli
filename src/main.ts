import path from 'path'
import { program } from 'commander'
import { parseCSV } from 'csv-load-sync'
import { promises as fs, default as fssync } from 'fs'
import request from 'superagent'
import { URL, parse } from 'url'
import { importMaterialsDb } from './import-materialsdb.js'

async function main() {
  program
    .name('vyzn-import-cli')
    .description('Imports data into the vyzn platform.')
    .version('1.0.0')

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
      importProducts(o.input, o.url, o.auth, o.category, o.verbose, o.diff)
    })

  program.command('delete-products')
    .description('delete products of a given category')
    .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
    .requiredOption('-a, --auth <file>', 'The file containing the auth token')
    .requiredOption('-c, --category <id>', 'The id of the category')
    .option('-v, --verbose', 'More detailed console output')
    .action((o) => {
      deleteProducts(o.url, o.auth, o.category, o.verbose)
    })

  program.command('import-materialsdb')
    .description('imports data from materialsdb.org source')
    .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
    .requiredOption('-a, --auth <file>', 'The file containing the auth token')
    .requiredOption('-c, --category <id>', 'The id of the category')
    .option('-v, --verbose', 'More detailed console output')
    .action((o) => {
      importMaterialsDb(o.url, o.auth, o.category, o.verbose)
    })

  program
    .command('import-catalog')
    .description('import catalog from a JSON file')
    .requiredOption('-i, --input <file>', 'path to the file to import (.json)')
    .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
    .requiredOption('-a, --auth <file>', 'The file containing the auth token')
    .option('-v, --verbose', 'More detailed console output')
    .option('-d, --diff', 'Perform diff only')
    .action((o) => {
      importCatalog(o.input, o.url, o.auth, o.verbose, o.diff)
    })

  program
    .command('import-catalog-noref')
    .description('import catalog from a JSON file')
    .requiredOption('-i, --input <file>', 'path to the file to import (.json)')
    .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
    .requiredOption('-a, --auth <file>', 'The file containing the auth token')
    .option('-v, --verbose', 'More detailed console output')
    .option('-d, --diff', 'Perform diff only')
    .action((o) => {
      importCatalogNoRef(o.input, o.url, o.auth, o.verbose, o.diff)
    })

  program
    .command('import-catalog-noref-nomat')
    .description('import catalog from a JSON file')
    .requiredOption('-i, --input <file>', 'path to the file to import (.json)')
    .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
    .requiredOption('-a, --auth <file>', 'The file containing the auth token')
    .option('-v, --verbose', 'More detailed console output')
    .option('-d, --diff', 'Perform diff only')
    .action((o) => {
      importCatalogNoRefNoMat(o.input, o.url, o.auth, o.verbose, o.diff)
    })



  program.parse()
}

async function importProducts(input: string, url: string, auth: string, category: string, verbose: boolean, diff: boolean) {
  // Validate commandline arguments
  await assertFile(input)
  await assertUrl(url)
  await assertFile(auth)

  // Read files
  const csv = await readCsv(input)
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

  // Get current catalogue
  const catalogues = await request.get(new URL('/dbs-catalogue/v1/catalogues', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')
  const selectedCatalogueId = catalogues.body.selectedCatalogueId

  const hierarchy = (await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}`, url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const types = (await request.get(new URL('/dbs-catalogue/v1/types', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const productTypeNameToCategoryTypeIdMap = getProductTypeNameToCategoryTypeIdMap(types)

  // Process CSV line by line
  for (const row of csv) {
    // Get existing product
    let product = null
    try {
      let existingProdId = null
      // FIXME type
      let existingProds = await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}/products?query=${encodeURIComponent(row.ProductKey)}&limit=10`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')

      if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == row.ProductKey) {
        existingProdId = existingProds.body[0].id
      }

      if (existingProdId) {  
        const existingProd = await request.get(new URL('/dbs-catalogue/v1/products/' + existingProdId, url).href)
          .set('Authorization', authToken)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/, json')
          .set('Accept-Encoding', 'gzip, deflate, br')
          .set('Accept-Language', 'en-US,en;q=0.5')
          .set('Content-Type', 'application/json')
        if (existingProd && existingProd.body) {
          product = existingProd.body
          console.log(`${row.ProductKey} Updating existing product`)
        }
      }

    } catch (error) { console.log(error) }

    if (diff) {
      if (product) {
        for (const attributeName of Object.keys(row)) {
          if (attributeName.startsWith("vyzn.") || attributeName.startsWith("KBOB")) {
            let found = false
            for (const existingAttribute of product.attributes) {
              if (existingAttribute.name == attributeName) {
                found = true
                // fixme, read attribute definitions first and then convert to target type
                let newValue = row[attributeName]
                if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit") && !attributeName.endsWith("LCARefDimension") && !attributeName.endsWith("eBKPh.Section")) {
                  newValue = parseFloat(newValue)
                }

                if (existingAttribute.value != newValue) {
                  console.log(`${row.ProductKey} attribute '${attributeName}' value mismatch (existing: ${existingAttribute.value}, new: ${row[attributeName]})`)
                }
                break
              }
            }
            if (!found)
              console.log(`${row.ProductKey} attribute '${attributeName}' missing`)
          }
        }
      } else {
        console.log(`${row.ProductKey} does not exist yet`)
      }

      continue
    }

    let newType = row.Type
    let newSubType = row.SubType

    // migrate old data
    if (newType == "MATERIAL_LIST")
      newType = "REFERENCE_MATERIAL"

    let categoryId = category

    // identify individual target categories based on row
    if(row.categoryPath) {
      const categoryType = productTypeNameToCategoryTypeIdMap[row.Type]
      categoryId= await createCategoryPath(row.categoryPath, selectedCatalogueId, hierarchy, categoryType, url, authToken)
    } 

    // Create new product
    if (!product) {
      const newProd = await request.post(new URL('/dbs-catalogue/v1/products', url).href)
        .send({
          "name": row.Name,
          "productKey": row.ProductKey,
          "category": categoryId,
          "type": newType,
          "subType": newSubType,
        })
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
      product = newProd.body
      console.log(`${row.ProductKey} Creating new product`)
    }

    const id = product.id
    const attributeIds = {};
    for (const attr of product.attributes) {
      attributeIds[attr.name] = attr.id
    }

    const attributes = []
    for (const attributeName of Object.keys(row)) {
      if (attributeName.startsWith("vyzn.") || attributeName.startsWith("KBOB")) {
        const id = attributeIds[attributeName]
        if (!id) {
          console.log(`${row.ProductKey} Could not find attribute ${attributeName}`)
          continue
        }

        let value = row[attributeName]

        // fixme, read attribute definitions first and then convert to target type
        if (attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit") && !attributeName.endsWith("LCARefDimension") && !attributeName.endsWith("eBKPh.Section")) {
          value = parseFloat(value)
        }

        attributes.push({
          id: id,
          value: value
        })
      }
    }

    if (verbose)
      console.debug(JSON.stringify(attributes))

    const updatedProduct = await request.put(new URL('/dbs-catalogue/v1/products/' + id, url).href)
      .send({
        "name": row.Name,
        "productKey": row.ProductKey,
        "category": categoryId,
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
  }
}

async function deleteProducts(url: string, auth: string, category: string, verbose: string) {
  // Validate commandline arguments
  await assertUrl(url)
  await assertFile(auth)

  // Read files
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });


  // Get current catalogue
  const selectedCatalogue = await request.get(new URL('/dbs-catalogue/v1/catalogues/selected', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')

  const cat = findSubcategoryById(selectedCatalogue.body.content, category)
  const childCategoriesRecursive = getAllCategoriesRecursive(cat)

  for (const categoryToDelete of childCategoriesRecursive) {
    if (verbose) console.log(`Deleting category '${categoryToDelete.name}'`)

    const productsInCategory = await request.get(new URL(`/dbs-catalogue/v1/categories/${categoryToDelete.id}/products`, url).href)
      .set('Authorization', authToken)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/, json')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('Accept-Language', 'en-US,en;q=0.5')
      .set('Content-Type', 'application/json')

    const numProducts = productsInCategory.body.length
    let idx = 0
    for (const product of productsInCategory.body) {
      if (verbose) {
        console.debug(`\tDeleting ${idx + 1}/${numProducts}: ${product.id} ${product.name}`)
      }

      try {
        await request.del(new URL(`/dbs-catalogue/v1/products/${product.id}`, url).href)
          .set('Authorization', authToken)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/, json')
          .set('Accept-Encoding', 'gzip, deflate, br')
          .set('Accept-Language', 'en-US,en;q=0.5')
          .set('Content-Type', 'application/json')
      } catch (e) {
        console.error(console.error(e, e.stack))
      }

      idx++
    }

    try {
      await request.del(new URL(`/dbs-catalogue/v1/categories/${categoryToDelete.id}`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
    } catch (e) {
      console.error(console.error(e, e.stack))
    }
  }
}

const createdPathsCache = {}
const lcaProductsCache = {}
const materialsCache = {}

async function createCategoryPath(categoryPath: string, catalogueId: string, hierarchy: any, typeId: string, url: string, auth: string) {
  const categoryPathDelimiter = " > "
  const paths = categoryPath.split(categoryPathDelimiter)

  const createdPathsCacheKey = paths.join(';')
  if (createdPathsCache[createdPathsCacheKey]) {
    return createdPathsCache[createdPathsCacheKey].id
  }

  let currentNode: any = hierarchy.content
  let lastCatId = null

  for (let i = 0; i < paths.length; i++) {
    if (i == 0) continue // skip root node
    let found = false
    if (currentNode) {
      for (const subcat of currentNode.subcategories) {
        if (subcat.name == paths[i]) {
          currentNode = subcat
          found = true
          break
        }
      }
    }
    if (!found) {
      const currentPath = paths.slice(0, i + 1)
      const currentPathKey = currentPath.join(';')

      if (createdPathsCache[currentPathKey]) {
        lastCatId = createdPathsCache[currentPathKey].id
      } else {
        //console.error("creating path:" + paths[i])
        const newCat = (await request.post(new URL('/dbs-catalogue/v1/categories', url).href)
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
          .set('Content-Type', 'application/json')).body
        lastCatId = newCat.id
        createdPathsCache[currentPathKey] = newCat
      }
      currentNode = null
    }
  }

  const leafCategoryId = lastCatId ? lastCatId : currentNode.id
  return leafCategoryId
}

async function importCatalog(input: string, url: string, auth: string, verbose: boolean, diff: boolean) {
  const lcaAttributeGroup = 'Ökobilanz'

  // Validate commandline arguments
  await assertFile(input)
  await assertUrl(url)
  await assertFile(auth)

  // Read files
  const componentsFile = await fs.readFile(input, { encoding: 'utf8', flag: 'r' });
  const componentsObj = JSON.parse(componentsFile)
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

  // Get current catalogue
  const catalogues = await request.get(new URL('/dbs-catalogue/v1/catalogues', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')
  const selectedCatalogueId = catalogues.body.selectedCatalogueId

  const hierarchy = (await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}`, url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const types = (await request.get(new URL('/dbs-catalogue/v1/types', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const productTypeNameToCategoryTypeIdMap = getProductTypeNameToCategoryTypeIdMap(types)

  const attributeGroups = await request.get(new URL('/dbs-catalogue/v1/attributeGroups', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')

  let lcaAttributeGroupId = null;
  for (const g of attributeGroups.body) {
    if (g.name == lcaAttributeGroup) {
      lcaAttributeGroupId = g.id
      break
    }
  }
  if (!lcaAttributeGroupId) throw `Could not find attribute group with name ${lcaAttributeGroup}`

  await importProductsOfType(componentsObj.products, "REFERENCE_MATERIAL", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, authToken, verbose, diff)
  await importProductsOfType(componentsObj.products, "MATERIAL", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, authToken, verbose, diff)
  await importProductsOfType(componentsObj.products, "COMPONENT", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId,url, authToken, verbose, diff)
}

async function importCatalogNoRef(input: string, url: string, auth: string, verbose: boolean, diff: boolean) {
  const lcaAttributeGroup = 'Ökobilanz'

  // Validate commandline arguments
  await assertFile(input)
  await assertUrl(url)
  await assertFile(auth)

  // Read files
  const componentsFile = await fs.readFile(input, { encoding: 'utf8', flag: 'r' });
  const componentsObj = JSON.parse(componentsFile)
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

  // Get current catalogue
  const catalogues = await request.get(new URL('/dbs-catalogue/v1/catalogues', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')
  const selectedCatalogueId = catalogues.body.selectedCatalogueId

  const hierarchy = (await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}`, url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const types = (await request.get(new URL('/dbs-catalogue/v1/types', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const productTypeNameToCategoryTypeIdMap = getProductTypeNameToCategoryTypeIdMap(types)

  const attributeGroups = await request.get(new URL('/dbs-catalogue/v1/attributeGroups', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')

  let lcaAttributeGroupId = null;
  for (const g of attributeGroups.body) {
    if (g.name == lcaAttributeGroup) {
      lcaAttributeGroupId = g.id
      break
    }
  }
  if (!lcaAttributeGroupId) throw `Could not find attribute group with name ${lcaAttributeGroup}`

  await importProductsOfType(componentsObj.products, "MATERIAL", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, authToken, verbose, diff)
  await importProductsOfType(componentsObj.products, "COMPONENT", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId,url, authToken, verbose, diff)
}

function getProductTypeNameToCategoryTypeIdMap(types: any) {
  const typesDict = {}
  for (const t of types)
    typesDict[(t as any).name] = t

  const productTypeNameToCategoryTypeIdMap = {
    "REFERENCE_MATERIAL": typesDict["MAT"].id,
    "MATERIAL": typesDict["MAT"].id,
    "COMPONENT": typesDict["BT"].id,
    "BUILDING_TECHNOLOGY": typesDict["BUILDING_TECHNOLOGY"].id,
    "OTHER_RESOURCE": typesDict["OTHER_RESOURCE"].id,
  }

  return productTypeNameToCategoryTypeIdMap
}  

async function importCatalogNoRefNoMat(input: string, url: string, auth: string, verbose: boolean, diff: boolean) {
  const lcaAttributeGroup = 'Ökobilanz'

  // Validate commandline arguments
  await assertFile(input)
  await assertUrl(url)
  await assertFile(auth)

  // Read files
  const componentsFile = await fs.readFile(input, { encoding: 'utf8', flag: 'r' });
  const componentsObj = JSON.parse(componentsFile)
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

  // Get current catalogue
  const catalogues = await request.get(new URL('/dbs-catalogue/v1/catalogues', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')
  const selectedCatalogueId = catalogues.body.selectedCatalogueId

  const hierarchy = (await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}`, url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const types = (await request.get(new URL('/dbs-catalogue/v1/types', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')).body

  const productTypeNameToCategoryTypeIdMap = getProductTypeNameToCategoryTypeIdMap(types)

  const attributeGroups = await request.get(new URL('/dbs-catalogue/v1/attributeGroups', url).href)
    .set('Authorization', authToken)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/, json')
    .set('Accept-Encoding', 'gzip, deflate, br')
    .set('Accept-Language', 'en-US,en;q=0.5')
    .set('Content-Type', 'application/json')

  let lcaAttributeGroupId = null;
  for (const g of attributeGroups.body) {
    if (g.name == lcaAttributeGroup) {
      lcaAttributeGroupId = g.id
      break
    }
  }
  if (!lcaAttributeGroupId) throw `Could not find attribute group with name ${lcaAttributeGroup}`

  await importProductsOfType(componentsObj.products, "COMPONENT", selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId,url, authToken, verbose, diff)
}


let anchorFound = false

async function importProductsOfType(products, type: string, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId: string, url: string, auth: string, verbose: boolean, diff: boolean) {
  for (const [key, value] of Object.entries(products)) {
    let prod: any = value
    if (prod.type != type) continue

    //if(!prod.categoryPath.endsWith('Gebäudetechnik')) continue
    //if (prod.name == "Abdichtung - Bitumentrennlage 1-lagig 3.5mm") anchorFound = true
    //if (!anchorFound) continue
    //if (prod.name != "Holzschalung - Fi/Ta, 24mm") continue
    //if (key.startsWith("KBOB2016")) continue
    //console.error(key)
    
    await importSingleProduct(key, prod, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId, url, auth, verbose, diff)
  }
}

async function importSingleProduct(prodKey, prod, selectedCatalogueId, hierarchy, productTypeNameToCategoryTypeIdMap, lcaAttributeGroupId: string, url: string, authToken: string, verbose: boolean, diff: boolean) {
  const migrateAttributes = false; // set to true if the attributes stored in the source file do not match to the target environment and need migration
  const categoryType = productTypeNameToCategoryTypeIdMap[prod.type]
  const categoryId = await createCategoryPath(prod.categoryPath, selectedCatalogueId, hierarchy, categoryType, url, authToken)

  if (!categoryId)
    console.error(`missing category for product: ${prodKey}`)

  // Get existing product
  let product = null
  try {
    let existingProdId = null
    let existingProds = await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}/products?type=${prod.type}&query=${encodeURIComponent(prodKey)}&limit=10`, url).href)
      .set('Authorization', authToken)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/, json')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('Accept-Language', 'en-US,en;q=0.5')
      .set('Content-Type', 'application/json')

    if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == prodKey) {
      existingProdId = existingProds.body[0].id
    }

    if (existingProdId) {
      return
      const existingProd = await request.get(new URL('/dbs-catalogue/v1/products/' + existingProdId, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language', 'en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
      if (existingProd && existingProd.body) {
        product = existingProd.body
        console.log(`${prodKey} Updating existing product`)
      }
    }
  } catch (error) { console.log(error) }

  if(product && prod.type == "COMPONENT") {
    console.log(`${prodKey} Deleting existing product since it is a component`)
    await request.del(new URL('/dbs-catalogue/v1/products/' + product.id, url).href)
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
    product = null     
  }

  // Create new product
  if (!product) {
    console.log(`${prodKey} Creating new product`)
    const newProd = await request.post(new URL('/dbs-catalogue/v1/products', url).href)
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
    product = newProd.body
  }

  const id = product.id
  const attributeIds = {};
  for (const attr of product.attributes) {
    attributeIds[attr.name] = attr.id
  }

  const attributes = []
  for (const [attrKey, attrValue] of Object.entries(prod.attributes)) {
    let key = attrKey;

    if(migrateAttributes) {
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

    if(!attributeIds[key]) {
        console.error(`ATTRIBUTE MISMATCH: Attribute with key ${key} was not found, skipping attribute!`)
        continue
    }

    attributes.push({
      id: attributeIds[key],
      value: attrValue
    })
  }
  const updatedProduct = await request.put(new URL('/dbs-catalogue/v1/products/' + id, url).href)
    .send({
      "name": prod.name,
      "productKey": prodKey,
      "category": categoryId,
      "type": prod.type,
      "status": "approved",
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

  if (prod.type == "COMPONENT") {
    // fixme, replace hardcoded guids
    await request.put(new URL(`/dbs-catalogue/v1/products/${id}/sectionAttributes`, url).href)
      .send(["644890f2-7c50-475c-91a0-103d44d6583c"])
      .set('Authorization', authToken)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/, json')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('Accept-Language', 'en-US,en;q=0.5')
      .set('Content-Type', 'application/json')

    await request.put(new URL(`/dbs-catalogue/v1/products/${id}/layerAttributes`, url).href)
      .send(["15737593-eb2d-4fdd-ab08-79e06a61490e", "2e043d3e-c8ec-4bca-9c9e-9e1bece51ece"])
      .set('Authorization', authToken)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/, json')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('Accept-Language', 'en-US,en;q=0.5')
      .set('Content-Type', 'application/json')

    const associationAttributes = (await request.get(new URL(`/dbs-catalogue/v1/associationAttributes`, url).href)
      .set('Authorization', authToken)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/, json')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('Accept-Language', 'en-US,en;q=0.5')
      .set('Content-Type', 'application/json')).body

    const associationAttributesDict = {}
    for (const attr of associationAttributes) {
      const associationAttribute: any = attr
      associationAttributesDict[associationAttribute.name] = associationAttribute
    }

    const layerIds = []
    for (const [layerKey, layerValue] of Object.entries(prod.matrix.layers)) {
      const layer: any = layerValue
      const layerAssociationAttributes = []
      for (let [attrName, attrValue] of Object.entries(layer.associationAttributes)) {

        if(migrateAttributes) {
          if (attrName == 'vyzn.catalogue.LayerThickness')
              attrName = 'vyzn.catalog.LayerThickness';
          else if (attrName == 'vyzn.catalogue.SectionPercentage')
              attrName = 'vyzn.catalog.SectionPercentage';
        }

        const associationAttribute = associationAttributesDict[attrName]
        if (!associationAttribute) {
          console.error(`association attribute not found: ${attrName}`)
          continue
        }
        layerAssociationAttributes.push({
          attribute: associationAttribute.id,
          displayName: associationAttribute.displayName,
          name: associationAttribute.name,
          unit: associationAttribute.unit,
          value: `${attrValue}`
        })
      }

      const newLayer = await request.post(new URL(`/dbs-catalogue/v1/productLayers`, url).href)
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

      await request.patch(new URL(`/dbs-catalogue/v1/productLayers/${newLayer.body.id}`, url).href)
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

      layerIds.push(newLayer.body.id)
    }

    const sectionIds = []
    for (const [sectionKey, sectionValue] of Object.entries(prod.matrix.sections)) {
      const section: any = sectionValue

      const sectionAssociationAttributes = []
      for (let [attrName, attrValue] of Object.entries(section.associationAttributes)) {

        if(migrateAttributes) {
          if (attrName == 'vyzn.catalogue.LayerThickness')
              attrName = 'vyzn.catalog.LayerThickness';
          else if (attrName == 'vyzn.catalogue.SectionPercentage')
              attrName = 'vyzn.catalog.SectionPercentage';
        }

        const associationAttribute = associationAttributesDict[attrName]
        if (!associationAttribute) {
          console.error(`association attribute not found: ${attrName}`)
          continue
        }
        sectionAssociationAttributes.push({
          attribute: associationAttribute.id,
          displayName: associationAttribute.displayName,
          name: associationAttribute.name,
          unit: associationAttribute.unit,
          value: `${attrValue}`
        })
      }

      const newSection = await request.post(new URL(`/dbs-catalogue/v1/productSections`, url).href)
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

      await request.patch(new URL(`/dbs-catalogue/v1/productSections/${newSection.body.id}`, url).href)
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

      sectionIds.push(newSection.body.id)
    }

    for (const [cellKey, cellValue] of Object.entries(prod.matrix.cells)) {
      const cell: any = cellValue

      let materialId = null
      if(materialsCache[cell.materialKey]) {
        materialId = materialsCache[cell.materialKey]
      } else {
        let existingProds = await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}/products?type=MATERIAL&query=${encodeURIComponent(cell.materialKey)}&limit=10`, url).href)
          .set('Authorization', authToken)
          .set('Content-Type', 'application/json')
          .set('Accept', 'application/, json')
          .set('Accept-Encoding', 'gzip, deflate, br')
          .set('Accept-Language', 'en-US,en;q=0.5')
          .set('Content-Type', 'application/json')

        if (existingProds && existingProds.body && existingProds.body.length && existingProds.body[0] && existingProds.body[0].id && existingProds.body[0].productKey == cell.materialKey) {
          materialId = existingProds.body[0].id
          materialsCache[cell.materialKey] = materialId
        }
      }

      if (!materialId) {
        console.error(`Could not find material: ${materialId}`)
        continue
      }

      await request.post(new URL(`/dbs-catalogue/v1/productCellLink`, url).href)
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
        .set('Content-Type', 'application/json')
    }
  }

  
  if(prod.type == "MATERIAL") {
    let lcaProductId = null
    const lcaCode = prod.linkedReferenceMaterialKey
    if(lcaCode) {
      if(!lcaProductsCache[lcaCode]) {
        const lcaProducts = await request.get(new URL(`/dbs-catalogue/v1/catalogues/${selectedCatalogueId}/products?type=REFERENCE_MATERIAL&query=${lcaCode}&limit=10`, url).href)
                                .set('Authorization', authToken)
                                .set('Content-Type', 'application/json')
                                .set('Accept', 'application/, json')
                                .set('Accept-Encoding', 'gzip, deflate, br')
                                .set('Accept-Language','en-US,en;q=0.5')
                                .set('Content-Type', 'application/json')
        
        if(!lcaProducts || !lcaProducts.body || !lcaProducts.body.length || !lcaProducts.body[0] || !lcaProducts.body[0].id) {
        } else {
          lcaProductId = lcaProducts.body[0].id
        }
          
        if(!lcaProductId) {
            console.log(`\tSkipping material because linked LCA product with key '${lcaCode}' could not be found'`)
        }
        lcaProductsCache[lcaCode] = lcaProductId
      } else {
        lcaProductId = lcaProductsCache[lcaCode]
      }
    }

    if(lcaProductId) {
      const existingMaterialListLinks = await request.get(new URL(`/dbs-catalogue/v1/reference-material-links/materials/${product.id}`, url).href)
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language','en-US,en;q=0.5')
        .set('Content-Type', 'application/json')

      let matchingMaterialListLinkId = null
      for(const link of existingMaterialListLinks.body) {
        if(link.attributeGroup.id == lcaAttributeGroupId) {
          matchingMaterialListLinkId = link.id
          break
        }
      }

      if(matchingMaterialListLinkId) {
        const materialListLink = await request.put(new URL(`/dbs-catalogue/v1/reference-material-links/${matchingMaterialListLinkId}`, url).href)
        .send({
            "materialId": id,
            "referenceMaterialId": lcaProductId,
            "attributeGroupId": lcaAttributeGroupId
        })
        .set('Authorization', authToken)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/, json')
        .set('Accept-Encoding', 'gzip, deflate, br')
        .set('Accept-Language','en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
      } else {
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
        .set('Accept-Language','en-US,en;q=0.5')
        .set('Content-Type', 'application/json')
      }
    }
  }
}


async function assertUrl(url: string) {
  if (!stringIsAValidUrl(url, ['http', 'https'])) {
    console.error(`Error: Invalid url '${url}'.`)
    process.exit(1)
  }
}

async function assertFile(file: string) {
  if (await fileExists(file) == false) {
    console.error(`Error: Could not find file at '${file}'.`)
    process.exit(1)
  }
}

/** Determines if a file exists */
async function fileExists(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    var result = fssync.existsSync(path);
    resolve(result);
  });
}

/** Reads a CSV file into a JS object */
async function readCsv(path: string): Promise<Array<any>> {
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
  } catch (err) {
    return false;
  }
};

function findSubcategoryById(data, id) {
  if (data.id === id) {
    return data;
  }
  for (let i = 0; i < (data.subcategories ?? []).length; i++) {
    let found = findSubcategoryById(data.subcategories[i], id);
    if (found) {
      return found;
    }
  }
  return null;
}

function getAllCategoriesRecursive(cat, resultList = []) {
  for (let i = 0; i < (cat.subcategories ?? []).length; i++) {
    getAllCategoriesRecursive(cat.subcategories[i], resultList);
  }
  resultList.push(cat);
  return resultList
}


main()