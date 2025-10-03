# vyzn-import-cli

Import product data into the vyzn platform.

## Installation

### Linux / MacOS

```
npm install
sudo npm i -g tsc
npx tsc
node dist/main.js --help
```

### Windows

```
npm install
npm i -g tsc
npx tsc
node dist/main.js --help
```

## Authentication

1. Open a browser and navigate to https://prod.vyzn.tech and log-in at the target tenant
2. Use the developer console of your browser to identify the authentication token (typically under Network > Headers > Authorization)
3. Save the authentication token to ./data/auth.txt

## Usage

```
$ node dist/main.js --help
Usage: vyzn-import-cli [options] [command]

Imports data into the vyzn platform.

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  import-products [options]  import products from a CSV file
  delete-products [options]  delete products of a given category
  convert-oekobaudat [options]  convert oekobaudat CSV to JSON structure
  help [command]             display help for command


$ node dist/main.js import-products --help
Usage: vyzn-import-cli import-products [options]

import products from a CSV file

Options:
  -i, --input <file>  path to the file to import (.csv)
  -u, --url <url>     The URL of the vyzn API
  -a, --auth <file>   The file containing the auth token
  -v, --verbose       More detailed console output
  -h, --help          display help for command


$ node dist/main.js delete-products --help
Usage: vyzn-import-cli delete-products [options]

delete products of a given category

Options:
  -u, --url <url>      The URL of the vyzn API
  -a, --auth <file>    The file containing the auth token
  -c, --category <id>  The id of the category
  -v, --verbose        More detailed console output
  -h, --help           display help for command


$ node dist/main.js convert-oekobaudat --help
Usage: vyzn-import-cli convert-oekobaudat [options]

convert oekobaudat CSV to JSON structure

Options:
  -i, --input <file>   Path to the oekobaudat CSV file
  -o, --output <file>  Path to the output JSON file
  -v, --verbose        More detailed console output
  -h, --help           display help for command
```
## Example

```
# Wipe all products of a category prior to import
$ npx tsc && node dist/main.js delete-products --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a14207c6-8620-4214-9101-d350372aea74

# (old) Import reference-materials from KBOB 
$ npx tsc && node dist/main.js import-products --input data/HRS_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a7ff1589-0e8c-42ff-bf27-5f8f499b8575
$ npx tsc && node dist/main.js import-products --input data/kbob_2022_v5_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a4444265-b369-41e4-b26f-409a8c0bce45
$ npx tsc && node dist/main.js import-products --input data/kbob_2022_v5_ref.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant master_catalog --category a14207c6-8620-4214-9101-d350372aea74

# Import reference-materials from KBOB
$ npx tsc && node dist/main.js import-catalog --input data/KBOB/kbob_2022_v5_ref.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant master_catalog -refmat -f -c b6453d6d-9b56-4173-bb34-8a5e5c1601ad
$ npx tsc && node dist/main.js import-catalog --input data/KBOB/kbob_2022_v5_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant master_catalog -mat -f -c a40767b1-2a1f-4091-915d-ced561feba5e



# Import materials from materialsdb.org
npx tsc && node dist/main.js import-materialsdb --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category 78792721-2ef0-4b33-ab09-547700fcb1cd --verbose true > out.txt

# Import complete catalog
$ npx tsc && node dist/main.js import-catalog --input data/temp.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt -refmat -mat -btech -ores -comp
$ npx tsc && node dist/main.js import-catalog --input data/catalog-1.2.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant test -refmat -mat -btech -ores -comp --tenant minergie

# Import only materials and components from catalog.json
$ npx tsc && node dist/main.js import-catalog-noref --input data/catalog.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt

# Import only components from catalog.json to a folder
$ npx tsc && node dist/main.js import-catalog --input data/converted_output_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant pirminjung -mat -refmat -c bcb9e84d-0a42-48bf-b7d5-254b0a4d9133




# Import lesolai materials
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/converted_output_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant demo -mat -f -c 1fc08275-20bc-426c-a827-edf88e54512d


# Import lesolai components
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/converted_output.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant fanzun -comp -f -c fa7e5058-72df-4a64-86e3-5c2e2a2a02e9

# Convert oekobaudat to JSON and run import
$ npx tsc && node dist/main.js convert-oekobaudat --input data/oekobaudat/OBD_2024_I_2025-09-29T05_28_59.csv --output data/oekobaudat/oekobaudat.json
npx tsc && node dist/main.js import-catalog --input data/oekobaudat/oekobaudat.json --url https://dbs-gateway-service-test.azurewebsites.net --auth data/auth.txt -refmat --tenant demo_de

# Patch a version *EXPERIMENTAL*
$ npx tsc && node dist/main.js patch-version --input data/pmj.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant pirminjung --project 3e1c3974-e6e2-4716-bc5a-0a2228cc72fd --building e00e98f9-d307-4b6f-b253-b11eed986eef --modelversion 35169502-6a31-452a-80e6-e85f78f3c3c7

ß
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to contribute.

## License
[MIT](https://choosealicense.com/licenses/mit/)
