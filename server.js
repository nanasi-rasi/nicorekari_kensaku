const http = require("http");
const fs = require("fs");
const mysql = require("mysql");
const cluster = require("cluster");
const os = require("node:os");
let fileCache = {}
let infomation_cache = ""
let logTemp = ""
const logSystem = require("./log.js");
let version_cache = "0"

const SQLconnect = mysql.createConnection({
    host: 'localhost',
    user: 'archive',
    password: 'archive',
    database: 'nikori_kari'
});

SQLconnect.connect(e => {
    if (e) {
      console.error('データベース接続エラー: ' + e.stack);
      return;
    }
    console.log('データベースに接続されました。');
});

const videos_SQL_query = 
`SELECT 
videos.*,
counts.view AS view,
counts.comment AS comment,
counts.mylist AS mylist,
counts.like AS \`like\`,
genres.key AS genre,
source.sourceValue AS sources
FROM videos
INNER JOIN source ON source.sourceValue = ? AND videos.id = source.videoId
INNER JOIN counts ON videos.id = counts.videoId
INNER JOIN genre_index ON videos.id = genre_index.videoId
INNER JOIN genres ON genre_index.genreId = genres.id
WHERE genres.key IN (%GENRE_VALIABLE%)
GROUP BY videos.id, counts.view, counts.comment, counts.mylist, counts.like
`;

const search_SQL_query = 
`SELECT 
videos.*,
counts.view AS view,
counts.comment AS comment,
counts.mylist AS mylist,
counts.like AS \`like\`,
genres.key AS genre,
source.sourceValue AS sources,
COALESCE(JSON_ARRAYAGG(DISTINCT tags.name), JSON_ARRAY()) AS tags
FROM videos
INNER JOIN source ON source.sourceValue = ? AND source.videoId = videos.id
INNER JOIN counts ON videos.id = counts.videoId
INNER JOIN genre_index ON videos.id = genre_index.videoId
INNER JOIN genres ON genre_index.genreId = genres.id
INNER JOIN tag_index ON videos.id = tag_index.videoId
INNER JOIN tags ON tag_index.tagId = tags.id
WHERE genres.key IN (%GENRE_VALIABLE%)
AND (
    videos.title LIKE "%検索クエリ%"
    OR videos.description LIKE "%検索クエリ%"
    OR tags.name LIKE "%検索クエリ%"
    OR videos.user_name LIKE "%検索クエリ%"
    OR videos.id LIKE "%検索クエリ%"
)
GROUP BY videos.id, counts.view, counts.comment, counts.mylist, counts.like
`

function Sort_SQL(id) { //ソート時に利用するSQL文
    if (id === "plays-decreasing") return "ORDER BY CAST(view AS UNSIGNED) DESC";
    else if (id === "plays-ascending") return "ORDER BY CAST(view AS UNSIGNED) ASC";
    else if (id === "mylists-decreasing") return "ORDER BY CAST(mylist AS UNSIGNED) DESC";
    else if (id === "mylists-ascending") return "ORDER BY CAST(mylist AS UNSIGNED) ASC";
    else if (id === "comments-decreasing") return "ORDER BY CAST(comment AS UNSIGNED) DESC";
    else if (id === "comments-ascending") return "ORDER BY CAST(comment AS UNSIGNED) ASC";
    else if (id === "likes-decreasing") return "ORDER BY CAST(`like` AS UNSIGNED) DESC";
    else if (id === "likes-ascending") return "ORDER BY CAST(`like` AS UNSIGNED) ASC";
    else if (id === "newer") return "ORDER BY registeredAt DESC";
    else if (id === "older") return "ORDER BY registeredAt ASC";
    else return ""
}

const decodeBase64Image = (dataString) => {
    try {
        const buffer = Buffer.from(dataString, 'base64');
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (error) {
        return "";
    }
    
};

if (cluster.isPrimary) {
    console.log("ホストが起動しました")
    for (let index = 0; index < os.cpus().length; index++) { //CPUコア数だけ起動する
        cluster.fork()
    }
    cluster.on("exit",() => {
        console.log("クラスター停止：再起動処理")
        cluster.fork()
            .on("message",m => {
                if (m === "restart") {
                    cluster.disconnect();
                    process.exit(0)
                } else {
                    logTemp += m + "\n";
                }
            })
    })
} else { //以下、クラスターであるプロセスでのみ実行
    console.log("クラスタが起動")
    http.createServer((req,res) => {
        if (req.url === "/infomation_txt") logSystem.infomationAccessLog(req,res)
        else logSystem.appendAccessLog(req,res)

        req.url = decodeURIComponent(req.url)
        req.url = req.url.replaceAll("../","./")
        if (req.url === "/") req.url = "/index.html"

        new Promise(async (resolve,reject) => { 
            if (req.url === "/infomation_txt") {
                res.writeHead(200,{"Content-Type": "text/plain;charset=utf-8","X-front-version":version_cache})
                res.end(infomation_cache)
            } else if (typeof fileCache[req.url] != "undefined") {
                res.writeHead(200,{"Content-Type": ContentType(req.url)});
                res.end(fileCache[req.url]);
            } else if (fs.existsSync("./data" + req.url) && fs.statSync("./data" + req.url).isFile()) {
                res.writeHead(200,{"Content-Type": ContentType(req.url)});
                res.end(fs.readFileSync("./data" + req.url,"utf-8"));
                fileCache[req.url] = fs.readFileSync("./data" + req.url,"utf-8");
            } else if (req.url.match(/\/videos\?/)) {
                //動画取得エンドポイント
                let Query_Obj1 = req.url.replace("/videos?","").split("&")
                let Query_Obj = {
                    "source": "",
                    "sort": "",
                    "count": "",
                    "genres": typeof Query_Obj1.filter(s => s.match(/genres/))[0] === "string" ? Query_Obj1.filter(s => s.match(/genres/))[0].length > 7 ? `"`+Query_Obj1.filter(s => s.match(/genres/))[0].replace(/genres=/,"").split(",").join(`","`)+`"` : await AllGenres() : await AllGenres()
                }
                
                if (Query_Obj1.filter(s => s.match(/source=/)).length > 0) Query_Obj.source = Query_Obj1.filter(s => s.match(/source/))[0].replace("source=","")
                    else Query_Obj.source = "2000" //sourceがないリクエストには何もクエリを返してあげない
                if (Query_Obj.source.length != 4 && Query_Obj.source.length != 5) Query_Obj.source = "2000"

                if (Query_Obj1.filter(s => s.match(/sort=|order=/)).length > 0) Query_Obj.sort = Query_Obj1.filter(s => s.match(/sort=|order=/))[0].replace(/sort=|order=/,"");
                    else Query_Obj.sort = "a"

                if (Query_Obj1.filter(s => s.match(/count=[0-9]{1,4},[0-9]{1,4}|line=[0-9]{1,4},[0-9]{1,4}/)).length > 0) Query_Obj.count = Query_Obj1.filter(s => s.match(/count|line/))[0].replace(/count=|line=/,"")
                    else Query_Obj.count = "0,0"

                Query_Obj.count = Query_Obj.count.match(",") ? Query_Obj.count.split(",") : Query_Obj.count.split("-");
                SQLconnect.query(videos_SQL_query.replace("%GENRE_VALIABLE%",Query_Obj.genres)+Sort_SQL(Query_Obj.sort)+"\nLIMIT ? OFFSET ?",[Query_Obj.source,Number(Query_Obj.count[1])-Number(Query_Obj.count[0]),Number(Query_Obj.count[0])],(err,results) => {
                    if (err) console.log(err.message)
                    const formattedResults = results.map(row => ({
                        id: row.id,
                        title: row.title,
                        registeredAt: new Date(row.registeredAt),
                        thumbnail: decodeBase64Image(row.thumbnail),
                        thumbnail_url: row.thumbnail_url,
                        genre: row.genre,
                        user_name: row.user_name !== 'N/A' ? row.user_name : null,
                        count: {
                            view: Number(row.view),
                            comment: Number(row.comment),
                            mylist: Number(row.mylist),
                            like: Number(row.like)
                        },
                        duration: row.duration,
                        description: row.description
                    }));
                    res.writeHead(200,{"Content-Type": ContentType(".json"),"X-front-version":version_cache});
                    res.end(JSON.stringify({"videos": formattedResults}))
                })
            } else if (req.url.match(/\/search\?/)) {
                let Query_Obj1 = req.url.replace("/search?","").split("&")
                let Query_Obj = {
                    "query": "",
                    "source": "",
                    "sort": "",
                    "genres": ""
                }
                if (Query_Obj1.filter(s => s.match(/query=/)).length > 0) Query_Obj.query = Query_Obj1.filter(s => s.match(/query=/))[0].replace("query=","");
                else Query_Obj.query = "a_i_u_e_o_" //queryがないリクエストには何も返してあげないよ
                if (Query_Obj.query.length < 1) Query_Obj.query = "sm0"; //queryが空のリクエストには何も返してあげないよ

                if (Query_Obj1.filter(s => s.match(/source=/)).length > 0) Query_Obj.source = Query_Obj1.filter(s => s.match(/source/))[0].replace("source=","");
                else Query_Obj.source = 2000 //sourceがないリクエストには何もクエリを返してあげない
                if (Query_Obj.source.length != 4 && Query_Obj.source.length != 5) Query_Obj.source = 2000

                if (Query_Obj1.filter(s => s.match(/sort=|order=/)).length > 0) Query_Obj.sort = Query_Obj1.filter(s => s.match(/sort|order/))[0].replace(/sort=|order=/,"");
                    else Query_Obj.sort = "a"

                if (Query_Obj1.filter(s => s.match(/genres=/)).length > 0) Query_Obj.genres = `"`+Query_Obj1.filter(s => s.match(/genres/))[0].replace(/genres=/,"").split(",").join(`","`)+`"`
                else Query_Obj.genres = await AllGenres()

                if (Query_Obj.genres.length <= 2) Query_Obj.genres = await AllGenres()
                SQLconnect.query(search_SQL_query.replace("%GENRE_VALIABLE%",Query_Obj.genres).replaceAll("%検索クエリ%",`%${Query_Obj.query}%`)+Sort_SQL(Query_Obj.sort),[Query_Obj.source],(err,results) => {
                    if (err) console.log(err.message)
                    const formattedResults = results.map(row => ({
                        id: row.id,
                        title: row.title,
                        registeredAt: new Date(row.registeredAt),
                        thumbnail: decodeBase64Image(row.thumbnail),
                        thumbnail_url: row.thumbnail_url,
                        genre: row.genre,
                        user_name: row.user_name !== 'N/A' ? row.user_name : null,
                        count: {
                            view: Number(row.view),
                            comment: Number(row.comment),
                            mylist: Number(row.mylist),
                            like: Number(row.like)
                        },
                        duration: row.duration,
                        description: row.description
                    }));
                    res.writeHead(200,{"Content-Type": ContentType(".json"),"X-front-version":version_cache});
                    res.end(JSON.stringify({"videos": formattedResults}))
                })

            } else {
                res.writeHead(404)
                res.end()
            }
            resolve(req,res)
        }).then((req,res) => {
        })
        res.on("error",() => {})
        req.on("error",() => {})
    })
    .listen(2525)
}

function ContentType(path) {
    if (path.match(/.*\.json/)) {
        return "application/json; charset=UTF-8;"
    } else if (path.match(/\.js/)) {
        return "text/javascript; charset=UTF-8;"
    } else if (path.match(/\.html/)) {
        return "text/html; charset=UTF-8;"
    } else if (path.match(/\.css/)) {
        return "text/css; charset=UTF-8;"
    } else if (path.match(/\.png/)) {
        return "image/png"
    } else if (path.match(/\.(jpg|jpeg)/)) {
        return "image/jpeg"
    } else {
        return "text/plain"
    }
}

function AllGenres () {
    return new Promise((resolve,reject) => {
        SQLconnect.query("SELECT `key` FROM genres",(err,results) => {
            resolve(`"${results.map(genre => genre.key).join("\",\"")}"`)
        })
    })
}

setInterval(() => {
    try {
        infomation_cache = fs.readFileSync("infomation.txt","utf-8");
    } catch (error) {}
    try {
        version_cache = fs.readFileSync("version.txt","utf-8") ?? "0";
    } catch (error) {}
}, 1000);
setInterval(() => {
    fileCache = {};
}, 5000);