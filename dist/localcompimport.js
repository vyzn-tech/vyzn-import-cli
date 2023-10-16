import fs from 'fs/promises';

async function readAndParseJson(filePath) {
    const rawData = await fs.readFile(filePath, 'utf8');
    return JSON.parse(rawData);
}

const filePath = "/Users/martinotschudi/Documents/GitHub/vyzn-import-cli/data/catalog.json";

async function main() {
    try {
        //import json catalog exported from the platform
        const import_catalog = await readAndParseJson(filePath);

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
        console.log(needed_materials)
        const needed_materials_key = Object.keys(needed_materials);
        for (const key of needed_materials_key) {
            let name = key
            let material = needed_materials[key]
            console.log(name)
        }



    } catch (error) {
        console.error('An error occurred:', error);
    }
}

main();

function getAllUniqueNeededMaterialKeys(components) {
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




  
function getProductsFromImportCatalog(type, catalog) {
    const products = {};
    for (const [key, product] of Object.entries(catalog.products)) {
        if (product.type === type) {
            products[key] = product;
        }
    }
    return products;
}
  
