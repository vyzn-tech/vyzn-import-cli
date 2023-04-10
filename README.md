# vyzn-import-cli

Import product data into the vyzn platform.

## Installation

```
npm install
npm i -g tsc
npx tsc
node dist/main.js --help
```

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
$ node dist/main.js delete-products --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category 115ca9b4-941f-4442-abae-ab626e415e44 --verbose

# Import products
$ node dist/main.js import-products --input data/kbob.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category 115ca9b4-941f-4442-abae-ab626e415e44

```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to contribute.

## License
[MIT](https://choosealicense.com/licenses/mit/)
