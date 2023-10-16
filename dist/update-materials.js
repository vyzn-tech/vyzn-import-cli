
import { URL } from 'url';
import request from 'superagent';
import { promises as fs } from 'fs';

const request = require('superagent');
const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });
const request = require('superagent');
const fs = require('fs').promises;

// Read command-line arguments
const args = process.argv.slice(2);

let url, authToken, category;

for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
        case '--url':
            url = args[i + 1];
            i++;
            break;
        case '--auth':
            authToken = fs.readFileSync(args[i + 1], 'utf8').trim(); // Assuming auth.txt contains just the token
            i++;
            break;
        case '--category':
            category = args[i + 1];
            i++;
            break;
        default:
            console.error(`Unknown argument: ${args[i]}`);
            process.exit(1);
    }
}



async function fetchAllMaterials() {
    try {
        const response = await request.get(new URL(`/products?category=${category}`, url).href)
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5');
        
        return response.body; // assuming the response contains a list of products
    } catch (error) {
        console.error('Error fetching materials:', error);
    }
}

async function renameAndSaveMaterial(material) {
    // Change the name according to your renaming scheme
    const newName = `NewName_${material.name}`; // Sample renaming scheme

    try {
        await request.put(new URL(`/products/${material.id}`, url).href)
            .send({
                "name": newName,
                // ... other product attributes if required ...
            })
            .set('Authorization', authToken)
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/, json')
            .set('Accept-Encoding', 'gzip, deflate, br')
            .set('Accept-Language', 'en-US,en;q=0.5');

        console.log(`Renamed material ${material.id} to ${newName}`);
    } catch (error) {
        console.error(`Error renaming material ${material.id}:`, error);
    }
}

(async function main() {
    const materials = await fetchAllMaterials();
    for (const material of materials) {
        await renameAndSaveMaterial(material);
    }
    console.log('Finished renaming all materials.');
})();
