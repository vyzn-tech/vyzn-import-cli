import path from 'path'
import { program } from 'commander'
import { parseCSV } from 'csv-load-sync'
import { promises as fs, default as fssync } from 'fs'
import request from 'superagent'
import { URL, parse } from 'url'

async function main() {
  program
  .name('vyzn-import-cli')
  .version('1.0.0')
  .description('Import product data into the vyzn platform.')
  .requiredOption('-i, --input <file>', 'path to the file to import (.csv)')
  .requiredOption('-u, --url <url>', 'The URL of the vyzn API')
  .requiredOption('-a, --auth <file>', 'The file containing the auth token')
  .requiredOption('-v, --verbose', 'More detailed console output')
  program.parse()

  const input = program.getOptionValue('input')
  const auth = program.getOptionValue('auth')
  const url = program.getOptionValue('url')
  const verbose = program.getOptionValue('verbose')

  // Validate commandline arguments
  if (await fileExists(input) == false) {
    console.error(`Error: Could not find input file at ${input}.`)
    process.exit(1)
  }
  if (!stringIsAValidUrl(url, ['http', 'https'])) {
    console.error(`Error: Invalid url '${url}'.`)
    process.exit(1)
  }
  if (await fileExists(auth) == false) {
    console.error(`Error: Could not find auth file at ${auth}.`)
    process.exit(1)
  }

  // Read files
  const csv = await readCsv(input)
  const authToken = await fs.readFile(auth, { encoding: 'utf8', flag: 'r' });

  // Process CSV line by line
  for(const row of csv) {
    const newProduct = await request.post(new URL('/products', url).href)
                                    .send({
                                      "name": row.Name,
                                      "productKey": row.ProductKey,
                                      "category": "115ca9b4-941f-4442-abae-ab626e415e44",
                                      "type": row.Type
                                    })
                                    .set('Authorization', authToken)
                                    .set('Content-Type', 'application/json')
                                    .set('Accept', 'application/, json')
                                    .set('Accept-Encoding', 'gzip, deflate, br')
                                    .set('Accept-Language','en-US,en;q=0.5')
                                    .set('Content-Type', 'application/json')

    const id = newProduct.body.id
    const attributeIds = {};
    for(const attr of newProduct.body.attributes) {
      attributeIds[attr.name] = attr.id
    }

    const attributes = []
    for(const attributeName of Object.keys(row)) {
      if(attributeName.startsWith("vyzn.") || attributeName.startsWith("KBOB")) {
        const id = attributeIds[attributeName]
        let value = row[attributeName]
        
        // fixme, read attribute definitions first and then convert to target type
        if(attributeName.startsWith("vyzn.") && !attributeName.endsWith("LCARefUnit")) {
          value = parseFloat(value)
        }

        attributes.push({
          id: id,
          value: value
        })
      }
    }

    if(verbose)
      console.debug(JSON.stringify(attributes))
      
    const updatedProduct = await request.put(new URL('/products/' + id, url).href)
                                    .send({
                                      "name": row.Name,
                                      "productKey": row.ProductKey,
                                      "category": "115ca9b4-941f-4442-abae-ab626e415e44",
                                      "type": row.Type,
                                      "status": "approved",
                                      "description": null,
                                      "hatchingPattern": null,
                                      "attributes" : attributes
                                    })
                                    .set('Authorization', authToken)
                                    .set('Content-Type', 'application/json')
                                    .set('Accept', 'application/, json')
                                    .set('Accept-Encoding', 'gzip, deflate, br')
                                    .set('Accept-Language','en-US,en;q=0.5')
                                    .set('Content-Type', 'application/json')
  }
}

/** Determines if a file exists */
async function fileExists(path: string) : Promise<boolean> {
  return new Promise((resolve, reject) => {
    var result = fssync.existsSync(path);
    resolve(result);
  });
}

/** Reads a CSV file into a JS object */
async function readCsv(path: string) : Promise<Array<any>> {
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


main()