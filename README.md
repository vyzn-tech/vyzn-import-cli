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
Usage: vyzn-import-cli [options]

Import product data into the vyzn platform.

Options:
  -V, --version       output the version number
  -i, --input <file>  path to the file to import (.csv)
  -u, --url <url>     The URL of the vyzn API
  -a, --auth <file>   The file containing the auth token
  -v, --verbose       More detailed console output
  -h, --help          display help for command
```
## Example

```
$ node dist/main.js --input data/kbob.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt

```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to contribute.

## License
[MIT](https://choosealicense.com/licenses/mit/)
