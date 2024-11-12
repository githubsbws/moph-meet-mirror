cd ./api
npm ci
tsc
cd ../user-app
npm ci
npm run generate
pm2 reload all