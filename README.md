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
```
## Example

```
# Wipe all products of a category prior to import
$ npx tsc && node dist/main.js delete-products --url https://dbs-gateway-service-dev.azurewebsites.net --auth data/auth.txt --category c2f7e05b-0851-4537-9676-9f25dc4cee73 --verbose

# Import reference-materials from KBOB
$ npx tsc && node dist/main.js import-products --input data/HRS_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a7ff1589-0e8c-42ff-bf27-5f8f499b8575
$ npx tsc && node dist/main.js import-products --input data/kbob_2022_v5_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a4444265-b369-41e4-b26f-409a8c0bce45
$ npx tsc && node dist/main.js import-products --input data/kbob_2022_v5_ref.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category 79a3b38a-dfbf-4ed5-9ac9-657973b4ff5d


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
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/converted_output_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant demo -mat -f -c 90adbe52-5827-4e3d-8517-7378023dcbc6


# Import lesolai components
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/converted_output.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant pirminjung -comp -f -c 749959d8-bf5b-441c-9913-9b9da67f7090




# Patch a version *EXPERIMENTAL*
$ npx tsc && node dist/main.js patch-version --input data/pmj.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant pirminjung --project 3e1c3974-e6e2-4716-bc5a-0a2228cc72fd --building e00e98f9-d307-4b6f-b253-b11eed986eef --modelversion 35169502-6a31-452a-80e6-e85f78f3c3c7

ß
```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to contribute.

## License
[MIT](https://choosealicense.com/licenses/mit/)
