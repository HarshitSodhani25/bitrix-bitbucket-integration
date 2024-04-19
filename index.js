const express = require("express");
require('dotenv').config();
const cors = require('cors');
const port = process.env.PORT || 8081;
const server = express();
const multer = require('multer')
const path = require('path');
const bodyParser = require('body-parser')
const { handlePullrequest} = require("./main.js");

server.use(bodyParser.urlencoded({extended: true}));
server.use(cors())
server.use(express.static(path.resolve(__dirname, 'uploads')));



//middleware 
server.use(express.json());
server.use(cors());
server.use((req, res, next) => {
    console.log(req.url);
    next();
})

// server.post('/bitrix/update', updateTask)
server.post('/bitbucket', handlePullrequest)

server.listen(port, ()=>console.log(`server is running on ${port}`))