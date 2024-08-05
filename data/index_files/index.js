"use strict";

let front_version = 0

window.onload = () => {
    const order = document.getElementById("order");
    const source = document.getElementById("source");
    const searchInput = document.getElementById("search-input");
    const searchButton = document.getElementById("search-button");
    const genre_checkbox = document.getElementsByName("genres");
    const clearButton = document.getElementById("clear-button");
    const searchResultContainer = document.getElementsByClassName("search-result")[0];
    
    document.getElementsByName("genres").forEach(option => { //チェックボタンが変更されるたびに再取得する
        option.addEventListener("change",() => {
            resetAndLoadVideos();
        })
    })

    let videos = [];
    let currentPage = 0;
    let loadedVideoCount = 0;
    let loading = false;  // データ読み込み中かどうかのフラグ

    document.getElementById("search-input").addEventListener("keydown", event => {
        if (event.key === "Enter") {
            searchVideos()
            document.getElementById("search-input").blur()
        }
    })

    const fetchData = async (url) => {
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('データ取得エラー:', error);
            return [];
        }
    };

    const renderVideos = (newVideo) => {
        if(document.getElementById("search-textbox-notempty")) document.getElementById("search-textbox-notempty").remove()
        if(document.getElementById("search-textbox-ratelimited")) document.getElementById("search-textbox-ratelimited").remove()
        if(document.getElementById("search-textbox-gatewayerror")) document.getElementById("search-textbox-gatewayerror").remove()
        if(document.getElementById("search-textbox-videoNoHit")) document.getElementById("search-textbox-videoNoHit").remove()
        if(document.getElementById("search-textbox-unknown_error")) document.getElementById("search-textbox-unknown_error").remove()
        
        const sourceValue = source.value;
        searchResultContainer.innerHTML += newVideo.map(video => `
            <div class="video" id="${video.id}">
                <div class="left">
                    <div class="thumbnail" style="background-image: url('${video.thumbnail_url ?? video.thumbnail}');">
                        <div class="duration">${Math.floor(video.duration / 60)}:${video.duration % 60}</div>
                    </div>
                    <div class="information">
                        <div class="date">投稿日時 : ${new Date(video.registeredAt).toLocaleString()}</div>
                        <div class="plays">再生 : ${video.count.view.toLocaleString()}</div>
                        <div class="comments">コメント : ${video.count.comment.toLocaleString()}</div>
                        <div class="mylists">マイリスト : ${video.count.mylist.toLocaleString()}</div>
                        <div class="likes">いいね : ${video.count.like.toLocaleString()}</div>
                    </div>
                </div>
                <div class="right">
                    <div class="title">
                        ${renderLink(sourceValue,video)}
                    </div>
                    <div class="description">
                        <p>${video.description.replace(/<.*?>/g, "")}</p>
                    </div>
                </div>
            </div>
        `).join('');
    };

    const loadVideos = async () => {
        if (document.getElementById("search-input").value.length > 0) {
            searchVideos();
            return;
        }
        if (loading) return;
        loading = true;

        const sourceValue = source.value;
        const orderValue = order.value;
        const videosPerPage = Math.floor(searchResultContainer.clientWidth / 300);
        const start = loadedVideoCount;
        const end = loadedVideoCount += videosPerPage*6;
        let genres_list = "";
        genre_checkbox.forEach(g => {
            if (g.checked && genres_list.length > 0) genres_list += ","
            if (g.checked) genres_list += `${g.value}`
        })
        const apiUrl = `/videos?source=${sourceValue}&sort=${orderValue}&count=${start},${end}&genres=${genres_list}`;

        const response = await fetchData(apiUrl);
        if (response.error) {
            loading = false;
            document.getElementsByClassName("search-result")[0].innerHTML += `<p id='search-textbox-unknown_error' style='text-align: center;'エラーが発生しました。<b>(診断情報：HTTP ${response.error.code})</b></p>`;
        }
        renderVideos(response.videos || []);
        loading = false;
        
        if ((response.videos || []).length < 1 && document.getElementById("search-input").value.length == 0 && currentPage * videosPerPage < 1000 && response.error.code === 200) { //ジャンルによっては動画数が非常に少ないため、必ず一つ表示されるまで読み込みを再帰的に行う
            searchResultContainer.innerHTML += "<p id='search-textbox-videoNoHit' style='text-align: center;'>動画がヒットしなかったため、自動読み込みを行っています...表示されるまで少々お待ちください...</p>";
            setTimeout(() => {
                loadVideos();
            }, 300);
        }
        
    };

    const handleScroll = () => {
        if ((window.innerHeight + window.scrollY) >= (document.body.offsetHeight-300)) {
            if (document.getElementById("search-input").value.length > 0) return ;//検索は追加読み込みの必要がないからキャンセルする
            loadVideos();
        }
    };

    const resetAndLoadVideos = async () => {
        videos = [];
        currentPage = 0;
        loadedVideoCount = 0;
        searchResultContainer.innerHTML = "";
        await loadVideos();
    };

    const searchVideos = async () => {
        searchResultContainer.innerHTML = "";
        if (loading) return;
        loading = true;

        const query = searchInput.value.trim();
        if (!query) {
            resetAndLoadVideos();
            return;
        }

        const sourceValue = source.value;
        const orderValue = order.value;
        let genres_list = "";
        genre_checkbox.forEach(g => {
            if (g.checked && genres_list.length > 0) genres_list += ","
            if (g.checked) genres_list += `${g.value}`
        })
        const apiUrl = `/search?query=${query.replace("+","%2B")}&source=${sourceValue}&order=${orderValue}&genres=${genres_list}`;

        const searchResults = await fetchData(apiUrl);
        if (!searchResults) {
            loading = false;
            return;
        }

        if (searchResults.error) {
            loading = false;
            document.getElementsByClassName("search-result")[0].innerHTML += `<p id='search-textbox-unknown_error' style='text-align: center;'エラーが発生しました。<b>(診断情報：HTTP ${response.error.code})</b></p>`;
        }
        
        loading = false;
        if(searchResults.length === 0) {
            searchResultContainer.innerHTML = "検索結果が見つかりませんでした。";
            loading = false;
            return;
        } else {
            renderVideos(searchResults.videos) //検索結果を表示
        }
    }; 

    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim() === '') {
            resetAndLoadVideos();
        }
    });

    order.onchange = resetAndLoadVideos;
    source.onchange = resetAndLoadVideos;
    searchButton.onclick = searchVideos;
    clearButton.onclick = () => {
        searchInput.value = '';
        resetAndLoadVideos();
    };

    window.addEventListener('scroll', handleScroll);

    // 初期読み込み
    resetAndLoadVideos();
    getInfomation()
    setInterval(() => {
        getInfomation()
    }, 3000);

    const unableAccessDate = {
        "2007": new Date("2024/06/18 12:00"),
        "2008": new Date("2024/06/21 12:00"),
        "2009": new Date("2024/06/24 12:00"),
        "2010": new Date("2024/06/27 12:00"),
        "2011": new Date("2024/07/01 12:00"),
        "2012": new Date("2024/07/04 12:00"),
        "2013": new Date("2024/07/08 12:00"),
        "2014": new Date("2024/07/11 12:00"),
        "2015": new Date("2024/07/15 12:00"),
        "8817": new Date("2024/07/18 12:00"),//人類には早すぎる動画
        "2016": new Date("2024/07/22 12:00"), 
        "8818": new Date("2024/07/25 12:00"),//才能の無駄遣い
        "2017": new Date("2024/07/29 12:00"),
        "2018": new Date("2024/08/01 12:00"),
        "2019": new Date("2024/08/05 16:00"),
        "ALL": new Date("2024/08/05 14:55")
    }
    function canWatchVideos(source) {
        return new Date().getTime() < unableAccessDate[source].getTime()
    }

    function renderLink(sourceValue,video) {
        if (!canWatchVideos("ALL")) {
            return  `<a target="_blank" href="https://www.nicovideo.jp/watch_tmp/${video.id}">${video.title}</a>`
        } else if (sourceValue.match(/7[0-9]{4}/)) {
            return `<a href="javascript:alert('この動画はボカコレ専用です。現時点では開けません。')">${video.title}</a>`
        } else if (!canWatchVideos(sourceValue)) {
            return `<a href="javascript:alert('${sourceValue}年の動画は視聴できません。')">${video.title}</a>`
        } else if (canWatchVideos(sourceValue)) {
            return `<a target="_blank" href="https://www.nicovideo.jp/watch_tmp/${video.id}">${video.title}</a>`
        }
    }

    fetch("https://counter.nanasi-rasi.net/domain").then(t => {
        t.text().then(t => {
            document.getElementById("count").innerHTML = String(t) + " 回"
        })
    })

    function getInfomation() {
        fetch("/infomation_txt").then(t => {
            t.text().then(text => document.getElementById("infomation").innerHTML = text)
            if (t.headers.get("X-front-version") === "0" || t.headers.get("X-front-version") == null) return ; //サーバー側に何も設定されていなかったら処理を中止する
            if (t.headers.get("X-front-version") == front_version) { //フロントエンドバージョンの照合と再読み込み処理
                return;
            } else if (t.headers.get("X-front-version") != front_version && front_version == 0) { //フロントエンドバージョンが設定されていない場合は設定する
                front_version = Number(t.headers.get("X-front-version"));
                return ;
            } else if (t.headers.get("X-front-version") != front_version && front_version != 0) { //フロントエンドバージョンが設定されていて、かつバックエンド側バージョンと違う場合
                alert("ユーザープログラムのバージョンが最新と異なるため、再読み込みを行います")
                window.location.reload(true) //キャッシュを無視してリロードできるらしい?
                return ;
            } else {
                return ;
            }
        })
    }
};