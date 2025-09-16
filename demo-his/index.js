const express = require('express')
const app = express()
const port = 3501

app.use(express.json())

const records = [ ]

app.get('/', (req, res) => {
    const content = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DEMO HIS Callback</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
</head>
<body>
    <div class="container mx-auto my-3">
            <h1>Demo Callback</h1>
            ${records.map(r => {
                return `
                <div class="card my-2">
                <div class="card-body">
                    ${Object.entries(r).map(([key, value]) => {
                        return `${key} : ${value}<br />`
                    }).join('')}
                </div>
                </div>
                `
            }).join(' ')}        
    </div>
</body>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
</html>
    `
  res.send(content)
})

app.post('/', (req, res) => {
    console.log(req.body)
    records.push(req.body)
    res.status(200).end()
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})