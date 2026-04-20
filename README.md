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
$ npx tsc && node dist/main.js delete-products --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant master_catalog --category beb5c76d-8b83-440d-b299-bd221580b56f

# (old) Import reference-materials from KBOB 
$ npx tsc && node dist/main.js import-products --input data/HRS_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a7ff1589-0e8c-42ff-bf27-5f8f499b8575
$ npx tsc && node dist/main.js import-products --input data/kbob_2022_v5_mat.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category a4444265-b369-41e4-b26f-409a8c0bce45
$ npx tsc && node dist/main.js import-products --input data/kbob_2016.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant --category 6f425cb0-7b82-4af6-a3e3-11835be93859

# Import reference-materials from KBOB
$ npx tsc && node dist/main.js import-catalog --input data/kbob_2016_r.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant grolimund+partner -refmat -f -c 1177f89f-b3a3-4ff5-9961-3d90fc1870dc

$ npx tsc && node dist/main.js import-catalog --input data/KBOB/kbob_2022_v7_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant suco -mat -f -c 4a71a1fd-70f0-4dc8-a4af-e17c2df7823d



# Import materials from materialsdb.org
npx tsc && node dist/main.js import-materialsdb --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --category 78792721-2ef0-4b33-ab09-547700fcb1cd --verbose true > out.txt

# Import complete catalog
$ npx tsc && node dist/main.js import-catalog --input data/temp.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt -refmat -mat -btech -ores -comp

$ npx tsc && node dist/main.js import-catalog --input data/grolimund_kbob16.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant grolimund+partner -comp 

# Import only materials and components from catalog.json
$ npx tsc && node dist/main.js import-catalog-noref --input data/catalog.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt

# Import only components from catalog.json to a folder
npx tsc && node dist/main.js import-catalog --input data/import_groli_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant grolimund+partner -mat -f -c 1177f89f-b3a3-4ff5-9961-3d90fc1870dc


# Import lesolai materials
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/G/H1_converted_output_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant -mat -f -c 09d99e54-2dfa-458f-93a4-3b45337e66e8


# Import lesolai components
$ npx tsc && node dist/main.js import-catalog --input data/lesosai-upload/G/H1_converted_output.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant -comp -f -c f2ac4153-fcf4-4b7f-99d6-f8c43dee533c
 

# Import KBOB 2016 
## Material & Ref Materials
...

# MEP & Other Resources
npx tsc && node dist/main.js import-products --input data/kbob/2016/kbob_2016_mep.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant

npx tsc && node dist/main.js import-products --input data/kbob/2016/kbob_2016_mat_ONLY_other_res.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant

npx tsc && node dist/main.js import-products --input data/kbob/2016/kbob_2016_disposal.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant

npx tsc && node dist/main.js import-products --input data/kbob/2016/kbob_2016_energy.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant

npx tsc && node dist/main.js import-products --input data/kbob/2016/kbob_2016_transport.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant mytenant

# Patch a version *EXPERIMENTAL*
$ npx tsc && node dist/main.js patch-version --input data/pmj.csv --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant pirminjung --project 3e1c3974-e6e2-4716-bc5a-0a2228cc72fd --building e00e98f9-d307-4b6f-b253-b11eed986eef --modelversion 35169502-6a31-452a-80e6-e85f78f3c3c7

```

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to contribute.

## License
[MIT](https://choosealicense.com/licenses/mit/)


Imports

npx tsc && node dist/main.js import-catalog --input data/erne.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant erne -mat -f -c f1fe2427-b21a-42c4-aad7-8281fb598563


npx tsc && node dist/main.js import-catalog --input data/fix_resources.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant impactliving -ores -f -c 9b3465a2-ece5-45d0-8885-a2dd3ac68177

npx tsc && node dist/main.js import-catalog --input data/impactlivingfull.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt -mat -btech -ores -comp --tenant impactliving 


__ Grolimund + Partner __
npx tsc && node dist/main.js import-catalog --input data/import_groli_mat.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant grolimund+partner -mat -f -c 09d99e54-2dfa-458f-93a4-3b45337e66e8

npx tsc && node dist/main.js import-catalog --input data/grolimund_kbob16.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant grolimund+partner -comp 


__ Boltshauser __
npx tsc && node dist/main.js import-catalog --input data/boltshauser/532_VYZN_Materials_final_confirmed.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant boltshauser -mat -f -c acf56f0c-b824-4ba9-9590-f8cc0733ca38

npx tsc && node dist/main.js import-catalog --input data/boltshauser/532_VYZN_Bodenaufbauten_converted_fixed.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant boltshauser -comp -f -c 70af9d8d-cd62-4412-8012-941900605d54
npx tsc && node dist/main.js import-catalog --input data/boltshauser/532_VYZN_Components_1_converted_fixed.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant boltshauser -comp -f -c 70af9d8d-cd62-4412-8012-941900605d54

__ AW __
npx tsc && node dist/main.js import-catalog --input data/532_VYZN_Materials_final_confirmed.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant amsteinwalthert -mat -f -c 962dddb8-fb8f-468d-8113-354e4b479911

npx tsc && node dist/main.js import-catalog --input data/532_VYZN_Bodenaufbauten_converted_fixed.json --url https://dbs-gateway-service-prod.azurewebsites.net --auth data/auth.txt --tenant amsteinwalthert -comp -f -c 1a913f50-2571-4f9b-bfe9-5b669c7285ae
