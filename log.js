const fs = require("fs");
let str = "";
let infostr = ""

module.exports.appendAccessLog = 
function appendAccessLog(req,res) {
    str += DateTXT + ","
    str += typeof req.headers["cf-connecting-ip"] == "undefined" ? String(req.socket.remoteAddress).replace("::ffff:","") : req.headers["cf-connecting-ip"];
    str += "," + req.url;
    str += "," + String(req.headers["user-agent"]).replace(","," ")
    str += "," + process.pid
    str += "\n"
}

module.exports.infomationAccessLog = 
function infomationAccessLog(req,res) {
    infostr += DateTXT + ","
    infostr += typeof req.headers["cf-connecting-ip"] == "undefined" ? String(req.socket.remoteAddress).replace("::ffff:","") : req.headers["cf-connecting-ip"];
    infostr += "," + req.url;
    infostr += "," + String(req.headers["user-agent"]).replace(","," ")
    infostr += "," + process.pid
    infostr += "\n"
}

setInterval(() => {
    if (str.length > 0) {
        fs.createWriteStream("./nicorekari_access.log.csv",{"flags":"a","encoding":"utf-8"}).end(str)
            .on("error",e => {})
            .on("finish",() => str = "")
    }
    if (infostr.length > 0) {
        fs.createWriteStream("./nicorekari_infomation_access.log.csv",{"flags":"a","encoding":"utf-8"}).end(infostr)
            .on("error",e => {})
            .on("finish",() => infostr = "")
    }
}, 0.25);

setInterval(() => DateTXT = Date().replace("GMT+0900 (Japan Standard Time)","(JST)"),250)