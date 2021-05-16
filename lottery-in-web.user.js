// ==UserScript==
// @name         Bili动态抽奖助手
// @namespace    http://tampermonkey.net/
// @version      3.9.25
// @description  自动参与B站"关注转发抽奖"活动
// @author       shanmite
// @include      /^https?:\/\/space\.bilibili\.com/[0-9]*/
// @license      GPL
// @require      https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
// @require      https://cdn.jsdelivr.net/gh/shanmite/Lottery@3e4c90af6a6eff4afec30603e77014485c0df75b/lib/layer/layer.js
// @resource     layerCss https://cdn.jsdelivr.net/gh/shanmite/Lottery@3e4c90af6a6eff4afec30603e77014485c0df75b/lib/layer/layer.css
// @grant        GM_info
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @connect      gitee.com
// ==/UserScript==
(function () {
    "use strict"
    let [Script, config, errorbar] = [
        {
            version: `|version: ${GM_info.script.version}`,
            author: `@${GM_info.script.author}`,
            name: GM_info.script.name
        },
        {},
        {}
    ];
    /**
     * 基础工具
     */
    const Base = {
        /**
         * 安全的将JSON字符串转为对象
         * 超出精度的数应转为字符串
         * @param {string} params
         * @return {object}
         * 返回对象或空对象
         */
        strToJson(params) {
            const isJSON = (str => {
                if (typeof str === 'string') {
                    try {
                        const obj = JSON.parse(str);
                        return typeof obj === 'object' ? obj : false
                    } catch (_) {
                        console.log(str);
                        return false;
                    }
                } else {
                    console.log(`${str}\nIt is not a string!`);
                    return false;
                }
            })(params);
            return isJSON ? isJSON : {}
        },
        /**
         * 函数柯里化
         * @param {function} func
         * 要被柯里化的函数
         * @returns {function}
         * 一次接受一个参数并返回一个接受余下参数的函数
         */
        curryify(func) {
            function _c(restNum, argsList) {
                return restNum === 0 ?
                    func.apply(null, argsList) :
                    function (x) {
                        return _c(restNum - 1, argsList.concat(x));
                    };
            }
            return _c(func.length, []);
        },
        /**
         * 延时函数
         * @param {number} time ms
         * @returns {Promise<void>}
         */
        delay(time) {
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve()
                }, time)
            })
        },
        /**
         * 计数器 0..Infinity
         * @typedef Counter
         * @property {()=>Number} next
         * @property {()=>boolean} clear
         * @property {()=>Number} value
         * @returns {Counter}
         */
        counter() {
            let c = {
                i: 0,
                next: () => c.i++,
                clear: () => { c.i = 0 },
                value: () => c.i
            }
            return c
        },
        /**
         * 随机获取数组中的一个元素
         * @param {any[]} arr
         * @returns {any}
         */
        getRandomOne: arr => {
            let RandomOne = null;
            if (arr instanceof Array && arr.length) {
                RandomOne = arr[parseInt(Math.random() * arr.length)];
            }
            return RandomOne
        },
        /**
         * 判断是否是自己的主页
         * @param {string} href
         * @returns {boolean}
         */
        checkHref(href) {
            const reg = /space\.bilibili\.com\/([0-9]*)/;
            if (reg.exec(href)[1] === GlobalVar.myUID) return true
            Tooltip.log(document.title);
            return false
        },
        /**
         * 测试浏览器
         * @param { string } browser
         * @returns { boolean }
         */
        checkBrowser(browser) {
            if (/(compatible|Trident)/.test(browser)) {
                Toollayer.alert(Script.name, '当前浏览器内核为IE内核,请使用非IE内核浏览器!');
                return false;
            }
            if (!/Chrome/.test(browser)) Tooltip.warn('若出现问题请使用Chrome或Edge浏览器');
            return true;
        },
        /**
         * 将版本号转为数字
         * @example
         * 1.2.3 => 1.0203
         * @param {string} version
         * @returns {Number}
         */
        checkVersion(version) {
            return (version.match(/\d.*/)[0]).split('.').reduce((a, v, i) => a + (0.01 ** i) * Number(v), 0)
        },
        /**
         * 节流
         * @param {Function} func 
         * @param {number} delay 当函数在短时间内多次触发时，做节流，间隔delay时长再去执行
         */
        throttle(func, delay) {
            let timer = null,/* 用来保存setTimeout返回的值 */
                startTime = Date.now();/* 创建节流函数的时间 */
            return function () {
                let curTime = Date.now(),/* 返回的这个函数被调用的时间 */
                    remaining = delay - (curTime - startTime),/* 设定的delay与[上一次被调用的时间与现在的时间间隔]的差值 */
                    context = this,/* 上下文对象 */
                    args = arguments;/* 返回的这个函数执行时传入的参数 */
                clearTimeout(timer);/* 首先清掉定时器 */
                if (remaining <= 0) {
                    /* 假如距离上一次执行此函数的时间已经超过了设定的delay，则执行 */
                    func.apply(context, args);
                    startTime = Date.now();/* 重置最后执行时间为现在 */
                } else {
                    /* 否则，等到间隔时间达到delay时，执行函数 */
                    timer = setTimeout(() => {
                        func.apply(context, args);
                    }, remaining);
                }
            }
        },
        /**
         * 生成一段文档片段
         * @typedef DocumentStruct
         * @property {string} [tagname]
         * @property {Object.<string,string>} [attr]
         * @property {(el: Element) => void} [script]
         * @property {string} [text]
         * @property {Array<DocumentFragment>} [children]
         * @param {DocumentStruct} StructInfo
         * @returns {DocumentFragment}
         */
        createCompleteElement(StructInfo) {
            const { tagname, attr, script, text, children } = StructInfo;
            let frg = document.createDocumentFragment();
            let el = typeof tagname === 'string' ?
                document.createElement(tagname) : document.createDocumentFragment();
            if (typeof text === 'string' && text !== '') el.innerHTML = text;
            if (typeof attr === 'object') Object.entries(attr).forEach(
                ([key, value]) => { el.setAttribute(key, value) }
            );
            if (typeof script === 'function') script(el);
            if (children instanceof Array) children.forEach(
                child => { if (child instanceof DocumentFragment) el.appendChild(child) }
            );
            frg.appendChild(el);
            return frg;
        },
        /**
         * 插入Css
         * @param {string} text GM_resource_name
         * @param {string} myCss
         */
        addCss(text, myCss) {
            const myCSS = Base.createCompleteElement({
                tagname: 'style',
                attr: {
                    type: "text/css"
                },
                text: myCss + GM_getResourceText(text),
            });
            document.getElementsByTagName('head')[0].appendChild(myCSS);
        },
        /**
         * 提取开奖信息
         * @typedef LotteryNotice 开奖信息
         * @property {number} ts 0
         * @property {string} text '开奖时间: 未填写开奖时间'
         * @property {string} item '请自行查看'
         * @property {string} isMe '请自行查看'
         * @param {string} des 描述
         * @returns {LotteryNotice}
         */
        getLotteryNotice(des) {
            const r = /([\d零一二两三四五六七八九十]+)[.月]([\d零一二两三四五六七八九十]+)[日号]?/;
            let defaultRet = {
                ts: 0,
                text: '开奖时间: 未填写开奖时间',
                item: '请自行查看',
                isMe: '请自行查看'
            }
            if (des === '') return defaultRet
            const _date = r.exec(des) || [];
            const timestamp10 = ((month, day) => {
                if (month && day) {
                    let date = new Date(`${new Date(Date.now()).getFullYear()}-${month}-${day} 23:59:59`).getTime()
                    if (!isNaN(date)) return date / 1000;
                }
                return 0
            })(_date[1], _date[2])
            if (timestamp10 === 0) return defaultRet
            const timestamp13 = timestamp10 * 1000,
                time = new Date(timestamp13);
            const remain = (() => {
                const timestr = ((timestamp13 - Date.now()) / 86400000).toString()
                    , timearr = timestr.replace(/(\d+)\.(\d+)/, "$1,0.$2").split(',');
                const text = timearr[0][0] === '-' ?
                    `开奖时间已过${timearr[0].substring(1)}天余${parseInt(timearr[1] * 24)}小时` :
                    `还有${timearr[0]}天余${parseInt(timearr[1] * 24)}小时`;
                return text
            })();
            return {
                ...defaultRet,
                ts: timestamp10,
                text: `开奖时间: ${time.toLocaleString()} ${remain}`
            };
        },
        /**
         * @returns {Promise<JSON>} 设置
         */
        getMyJson() {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://gitee.com/shanmite/lottery-notice/raw/master/notice.json",
                    onload: function (response) {
                        const res = Base.strToJson((response || {}).responseText)
                        resolve(res);
                    },
                    onerror: function () {
                        resolve({});
                    }
                });
            })
        },
        getPictures() {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: "https://gitee.com/shanmite/lottery-notice/raw/master/pictures.json",
                    onload: function (response) {
                        const res = Base.strToJson((response || {}).responseText)
                        resolve(res);
                    },
                    onerror: function () {
                        resolve({});
                    }
                });
            })
        },
        /**存储 */
        storage: {
            /**
             * 获取本地值
             * @param {string} key
             * @returns {Promise<string>}
             */
            async get(key) {
                if (typeof GM_getValue === 'undefined') {
                    return localStorage.getItem(key)
                } else {
                    return await GM_getValue(key)
                }
            },
            /**
             * 存储本地值
             * @param {string} key
             * @param {Promise<void>} value
             */
            async set(key, value) {
                if (typeof GM_setValue === 'undefined') {
                    localStorage.setItem(key, value);
                    return;
                } else {
                    await GM_setValue(key, value)
                    return;
                }
            },
        }
    }
    /**
     * 浮动提示框
     */
    const Tooltip = (() => {
        const cCElement = Base.createCompleteElement
            , cssContent = ".shanmitelogbox {z-index:99999;position:fixed;top:0;right:0;max-width:400px;max-height:600px;overflow-y:scroll;scroll-behavior:smooth;}.shanmitelogbox::-webkit-scrollbar {width:0;}.shanmitelogbox .line {display:flex;justify-content:flex-end;}.shanmitelogbox .Info {line-height:26px;min-height:26px;margin:6px 0;border-radius:6px;padding:0px 10px;transition:background-color 1s;font-size:16px;color:#fff;box-shadow:1px 1px 3px 0px #000;}.shanmitelogbox .Log {background-color:#81ec81;}.shanmitelogbox .Warn {background-color:#fd2d2d;}"
            /** 显示运行日志 */
            , LogBox = cCElement({
                tagname: 'div',
                attr: {
                    class: 'shanmitelogbox',
                },
                children: [
                    cCElement({
                        tagname: 'style',
                        attr: {
                            type: 'text/css'
                        },
                        text: cssContent,
                    })
                ]
            });
        document.body.appendChild(LogBox);
        const logbox = document.querySelector('.shanmitelogbox');
        /**
         * 打印信息的公共部分
         * @param {string} classname 
         * @param {string} text 
         */
        const add = (classname, text) => {
            const log = cCElement({
                tagname: 'div',
                attr: {
                    class: 'line',
                },
                script: el => {
                    setTimeout(() => {
                        logbox.removeChild(el)
                    }, 6000)/* 自动移除 */
                },
                children: [
                    cCElement({
                        tagname: 'span',
                        attr: {
                            class: classname,
                        },
                        script: el => {
                            setTimeout(() => {
                                el.style.color = 'transparent';
                                el.style.backgroundColor = 'transparent';
                                el.style.boxShadow = 'none';
                            }, 5000);/* 显示5秒 */
                        },
                        text: text,
                    })
                ]
            });
            logbox.appendChild(log);
        }
        return {
            /**
             * 提示信息
             * @param {string} text
             */
            log: text => {
                console.log(text);
                add('Info Log', text)
            },
            /**
             * 警告信息
             * @param {string} text 
             */
            warn: text => {
                console.warn(text);
                add('Info Warn', text)
            }
        }
    })()
    /**
     * 弹窗组件
     */
    const Toollayer = (() => {
        const tools = {
            alert: (title, content) => {
                layer.alert(content, { title: `<strong>${title}</strong>`, shade: 0, closeBtn: 0, offset: 't', time: 5000 });
            },
            confirm: (title, content, btn, fn1 = function () { }, fn2 = function () { }, fn3 = function () { }) => {
                layer.confirm(content,
                    { title: `<strong>${title}</strong>`, btn: btn, shade: 0, closeBtn: 0, offset: 't', btn3: function (index) { layer.close(index); return fn3() } },
                    function (index) { layer.close(index); return fn1() },
                    function (index) { layer.close(index); return fn2() },
                );
            },
            prompt: (title, formType, fn, value) => {
                layer.prompt({ title: `<strong>${title}</strong>`, formType: formType, value: value, closeBtn: 0 },
                    function (value, index) { layer.close(index); return fn(value) }
                )
            },
            msg: (content, time = 2000, icon) => {
                layer.msg(content, { time: time, icon: icon })
            },
            tips: (content, element, tips, time, fixed, successFn = function () { }, contentCss = { "border-radius": "20px", "background-color": "#00c4f8" }, tipsGTCss = { "border-right-color": "#00c4f8" }) => {
                layer.tips(content, element, {
                    tips: tips,
                    time: time,
                    fixed: fixed,
                    success: (dom, index) => {
                        const layerContent = dom.children('.layui-layer-content'),
                            layerTipsGT = layerContent.children('.layui-layer-TipsG.layui-layer-TipsT');
                        layerContent.css(contentCss);
                        layerTipsGT.css(tipsGTCss);
                        successFn(dom, index)
                    },
                });
            }
        }
        return tools;
    })()
    /**
     * 事件总线
     */
    const eventBus = (() => {
        const eTarget = new EventTarget();
        return {
            /**
             * 监听事件
             * @param {string} type
             * @param {(e: CustomEvent<string>) => void} fn
             * ```js
             * ({ detail }) => detail;
             * (e) => e.detail
             * ```
             * @param {boolean | AddEventListenerOptions} [opt]
             */
            on(type, fn, opt) {
                eTarget.addEventListener(type, fn, opt);
            },
            /**
             * 取消监听事件
             * @param {string} type
             * @param {(e: CustomEvent<string>) => void} fn 
             * @param {boolean | AddEventListenerOptions} [opt]
             */
            off(type, fn, opt) {
                eTarget.removeEventListener(type, fn, opt);
            },
            /**
             * 触发事件
             * @param {string} type
             * @param {string} [detail]
             */
            emit(type, detail) {
                const event = new CustomEvent(type, { detail });
                eTarget.dispatchEvent(event);
            }
        }
    })()
    /**
     * Ajax请求对象
     */
    const Ajax = (() => {
        /**
         * 检查options是否符合要求
         * @param {object} options
         * @returns {boolean}
         */
        function checkOptions(options) {
            let result = false;
            if (typeof options !== 'object') {
                console.warn('类型错误: typeof Options !== Object');
                return result;
            } else {
                if (typeof options.url !== 'string') {
                    console.warn('类型错误: typeof Link !== Strings');
                    return result;
                } else {
                    const reg = /^https?:\/\/(?:\w+\.?)+(?:\/.*)*\/?$/i;
                    if (!reg.test(options.url)) {
                        console.warn('url字符串须为完整http链接');
                        return result;
                    }
                    result = true;
                }
            }
            return result;
        }
        /**
         * 对象转URL编码
         * @param {object} data
         */
        function objToURLCode(data) {
            var _result = [];
            for (var key in data) {
                var value = data[key];
                if (value instanceof Array) {
                    value.forEach(function (_value) {
                        _result.push(key + "=" + _value);
                    });
                } else {
                    _result.push(key + '=' + value);
                }
            }
            return _result.join('&');
        }
        /**
         * 请求
         * @param {string} method
         * @param {object} options
         */
        function request(method, options) {
            if (checkOptions(options)) {
                let xhr = new XMLHttpRequest();
                const { url: _url, queryStringsObj, data, dataType, hasCookies } = options
                    , url = typeof queryStringsObj === 'object' ?
                        _url + '?' + objToURLCode(queryStringsObj) : _url;
                switch (method) {
                    case 'GET':
                        xhr.open("GET", url);
                        break;
                    case 'POST':
                        xhr.open("POST", url);
                        xhr.setRequestHeader('Content-Type', dataType);
                        break;
                    default:
                        break;
                }
                if (hasCookies) xhr.withCredentials = true;
                xhr.timeout = 3000;
                xhr.addEventListener('load', () => {
                    if (xhr.status === 200) {
                        options.success(xhr.responseText)
                    } else {
                        console.error(`status:${xhr.status}`);
                        options.success(`{"code":${xhr.status},"msg":"频繁访问"}`);
                    }
                })
                xhr.addEventListener('error', () => {
                    console.error('ajax请求出错')
                    options.success('{"code":-1,"msg":"ajax请求出错"}');
                })
                xhr.addEventListener('timeout', () => {
                    console.error('请求超时')
                    options.success('{"code":-1,"msg":"请求超时"}');
                })
                switch (method) {
                    case 'GET':
                        xhr.send()
                        break;
                    case 'POST':
                        xhr.send((/urlencoded/.test(dataType)) ? objToURLCode(data) : data)
                        break;
                    default:
                        break;
                }
            }
        }
        return {
            /**
             * 发送Get请求
             * @param {Object} options
             */
            get(options) {
                request("GET", options);
            },
            /**
             * 发送Post请求
             * @param {object} options
             */
            post(options) {
                request("POST", options);
            }
        }
    })()
    /**
     * 网络请求
     */
    const BiliAPI = {
        /**
         * 获取关注列表
         * @param {number} uid 
         * @returns {Promise<string | null>}
         */
        getAttentionList: uid => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.vc.bilibili.com/feed/v1/feed/get_attention_list',
                    queryStringsObj: {
                        uid: uid
                    },
                    hasCookies: true,
                    success: responseText => {
                        let res = Base.strToJson(responseText)
                        if (res.code === 0) {
                            Tooltip.log('[获取关注列表]成功');
                            resolve(res.data.list.toString())
                        } else {
                            Tooltip.warn(`[获取关注列表]失败\n${responseText}`);
                            resolve(null)
                        }
                    }
                })
            });
        },
        /**
         * 获取一组动态的信息
         * @param {number} UID
         * 被查看者的uid
         * @param {string} offset
         * 此动态偏移量
         * 初始为 0
         * @returns {Promise<string>}
         */
        getOneDynamicInfoByUID: (UID, offset) => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/space_history',
                    queryStringsObj: {
                        visitor_uid: GlobalVar.myUID,
                        host_uid: UID,
                        offset_dynamic_id: offset,
                    },
                    hasCookies: true,
                    success: responseText => {
                        /* 鉴别工作交由modifyDynamicRes完成 */
                        resolve(responseText)
                    }
                })
            });
        },
        /**
         * 通过tag名获取tag的id
         * @param {string} tagename
         * tag名
         * @returns {Promise<number | -1>}
         * 正确:tag_ID  
         * 错误:-1
         */
        getTagIDByTagName: tagename => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.bilibili.com/x/tag/info',
                    queryStringsObj: {
                        tag_name: tagename
                    },
                    hasCookies: false,
                    success: responseText => {
                        const res = Base.strToJson(responseText);
                        if (res.code !== 0) {
                            Tooltip.warn('获取TagID失败');
                            resolve(-1)
                        } else {
                            resolve(res.data.tag_id)
                        }
                    }
                })
            });
        },
        /**
         * 获取tag下的热门动态以及一条最新动态
         * @param {number} tagid
         * @returns {Promise<string>}
         */
        getHotDynamicInfoByTagID: tagid => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.vc.bilibili.com/topic_svr/v1/topic_svr/topic_new',
                    queryStringsObj: {
                        topic_id: tagid
                    },
                    hasCookies: true,
                    success: responseText => {
                        resolve(responseText)
                    }
                })
            });
        },
        /**
         * 获取tag下的最新动态
         * @param {string} tagname
         * @param {string} offset
         * @returns {Promise<string>}
         */
        getOneDynamicInfoByTag: (tagname, offset) => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.vc.bilibili.com/topic_svr/v1/topic_svr/topic_history',
                    queryStringsObj: {
                        topic_name: tagname,
                        offset_dynamic_id: offset
                    },
                    hasCookies: true,
                    success: responseText => {
                        resolve(responseText)
                    }
                })
            });
        },
        /**
         * 获取关注数
         * @param {number} uid
         * @returns {Promise<number | 0>}
         */
        getUserInfo: uid => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.bilibili.com/x/web-interface/card',
                    queryStringsObj: {
                        mid: uid,
                    },
                    hasCookies: true,
                    success: responseText => {
                        const res = Base.strToJson(responseText);
                        if (res.code === 0) {
                            resolve(res.data.follower)
                        } else {
                            Ajax.get({
                                url: 'https://api.bilibili.com/x/relation/stat',
                                queryStringsObj: {
                                    vmid: uid
                                },
                                hasCookies: true,
                                success: responseText => {
                                    const res = Base.strToJson(responseText);
                                    if (res.code === 0) {
                                        resolve(res.data.follower)
                                    } else {
                                        Tooltip.warn(`获取关注数出错,可能是访问过频繁\n${responseText}`);
                                        resolve(0);
                                    }
                                }
                            })
                        }
                    }
                })
            });
        },
        /**
         * 获取开奖信息
         * @typedef LotteryNotice 开奖信息
         * @property {number} ts 0
         * @property {string} text '获取开奖信息失败'
         * @property {string} item 'null'
         * @property {string} isMe '未知'
         * @param {string} dyid 动态id
         * @returns {Promise<LotteryNotice>} 开奖时间
         */
        getLotteryNotice: dyid => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.vc.bilibili.com/lottery_svr/v1/lottery_svr/lottery_notice',
                    queryStringsObj: {
                        dynamic_id: dyid
                    },
                    hasCookies: false,
                    success: responseText => {
                        const res = Base.strToJson(responseText);
                        if (res.code === 0) {
                            const timestamp10 = res.data.lottery_time,
                                timestamp13 = timestamp10 * 1000,
                                time = new Date(timestamp13);
                            const remain = (() => {
                                const timestr = ((timestamp13 - Date.now()) / 86400000).toString()
                                    , timearr = timestr.replace(/(\d+)\.(\d+)/, "$1,0.$2").split(',');
                                const text = timearr[0][0] === '-' ? `开奖时间已过${timearr[0].substring(1)}天余${parseInt(timearr[1] * 24)}小时` : `还有${timearr[0]}天余${parseInt(timearr[1] * 24)}小时`;
                                return text
                            })();
                            let isMeB = (new RegExp(GlobalVar.myUID)).test(responseText);
                            const isMe = isMeB ? '中奖了！！！' : '未中奖';
                            const iteminfo = res.data.first_prize_cmt || '' + '  ' + res.data.second_prize_cmt || '' + '  ' + res.data.third_prize_cmt || '';
                            resolve({
                                ts: timestamp10,
                                text: `开奖时间: ${time.toLocaleString()} ${remain}`,
                                item: iteminfo,
                                isMe: isMe
                            });
                        } else {
                            Tooltip.log(`无法获取非官方抽奖信息\n${responseText}`);
                            resolve({
                                ts: 0,
                                text: '获取开奖信息失败',
                                item: 'null',
                                isMe: '未知'
                            })
                        }
                    }
                })
            });
        },
        /**
         * 之前应检查是否重复关注
         * 自动关注
         * 并转移分组
         * @param {Number} uid
         * 被关注者的UID
         * @returns
         */
        autoAttention: uid => {
            return new Promise((resolve) => {
                Ajax.post({
                    url: 'https://api.bilibili.com/x/relation/modify',
                    hasCookies: true,
                    dataType: 'application/x-www-form-urlencoded',
                    data: {
                        fid: uid,
                        act: 1,
                        re_src: 11,
                        jsonp: 'jsonp',
                        csrf: GlobalVar.csrf
                    },
                    success: responseText => {
                        /* 重复关注code also equal 0  */
                        if (/^{"code":0/.test(responseText)) {
                            Tooltip.log('[自动关注]关注+1');
                            resolve()
                        } else {
                            Tooltip.log(`[自动关注]失败,尝试切换线路\n${responseText}`);
                            Ajax.post({
                                url: 'https://api.vc.bilibili.com/feed/v1/feed/SetUserFollow',
                                hasCookies: true,
                                dataType: 'application/x-www-form-urlencoded',
                                data: {
                                    type: 1,
                                    follow: uid,
                                    csrf: GlobalVar.csrf
                                },
                                success: responseText => {
                                    if (/^{"code":0/.test(responseText)) {
                                        Tooltip.log('[自动关注]关注+1');
                                        resolve();
                                    } else {
                                        Tooltip.warn(`[自动关注]失败,请在"错误信息"处手动关注\n${responseText}`);
                                        errorbar.appendChild(Base.createCompleteElement({
                                            tagname: 'a',
                                            attr: {
                                                href: `https://space.bilibili.com/${uid}`,
                                                target: "_blank",
                                                style: "display: block;",
                                                title: '点击访问5s后自动移除'
                                            },
                                            script: (el) => {
                                                el.addEventListener('click', () => {
                                                    setTimeout(() => {
                                                        el.parentNode.removeChild(el);
                                                    }, 5000)
                                                })
                                            },
                                            text: `未成功关注的up|uid:${uid}`
                                        }))
                                        resolve();
                                    }
                                }
                            })
                        }
                    }
                })
            });
        },
        /**
         * 移动分区
         * @param {number} uid
         * @param {number} tagid 关注分区的ID
         */
        movePartition: (uid, tagid) => {
            Ajax.post({
                url: 'https://api.bilibili.com/x/relation/tags/addUsers?cross_domain=true',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    fids: uid,
                    tagids: tagid,
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    /* 重复移动code also equal 0 */
                    if (/^{"code":0/.test(responseText)) {
                        Tooltip.log('[移动分区]up主分区移动成功');
                    } else {
                        Tooltip.warn(`[移动分区]up主分区移动失败\n${responseText}`);
                    }
                }
            })
        },
        /**
         * 获取一个分区中50个的id
         * @param {number} tagid
         * @param {number} n 1->
         * @returns {Promise<number[]>}
         */
        getPartitionUID: (tagid, n) => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.bilibili.com/x/relation/tag',
                    queryStringsObj: {
                        mid: GlobalVar.myUID,
                        tagid: tagid,
                        pn: n,
                        ps: 50
                    },
                    hasCookies: true,
                    success: responseText => {
                        const res = Base.strToJson(responseText);
                        let uids = [];
                        if (res.code === 0) {
                            res.data.forEach(d => {
                                uids.push(d.mid);
                            })
                            Tooltip.log('[获取分组]成功获取取关分区列表');
                            resolve(uids)
                        } else {
                            Tooltip.warn(`[获取分组]获取取关分区列表失败\n${responseText}`);
                            resolve(uids)
                        }
                    }
                })
            });
        },
        /**
         * 取消关注
         * @param {number} uid 
         * @returns {void}
         */
        cancelAttention: uid => {
            Ajax.post({
                url: 'https://api.bilibili.com/x/relation/modify',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    fid: `${uid}`,
                    act: 2,
                    re_src: 11,
                    jsonp: 'jsonp',
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    const res = Base.strToJson(responseText)
                    if (res.code === 0) {
                        Tooltip.log('[自动取关]取关成功')
                    } else {
                        Tooltip.log(`[自动取关]失败,尝试切换线路\n${responseText}`);
                        Ajax.post({
                            url: 'https://api.vc.bilibili.com/feed/v1/feed/SetUserFollow',
                            hasCookies: true,
                            dataType: 'application/x-www-form-urlencoded',
                            data: {
                                type: 0,
                                follow: uid,
                                csrf: GlobalVar.csrf
                            },
                            success: responseText => {
                                if (/^{"code":0/.test(responseText)) {
                                    Tooltip.log('[自动取关]取关成功');
                                } else {
                                    Tooltip.warn(`[自动取关]失败\n${responseText}`);
                                }
                            }
                        })
                    }
                }
            })
        },
        /**
         * 动态自动点赞
         * @param {string} dyid
         * @returns {void}
         */
        autolike: dyid => {
            Ajax.post({
                url: 'https://api.vc.bilibili.com/dynamic_like/v1/dynamic_like/thumb',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    uid: GlobalVar.myUID,
                    dynamic_id: dyid,
                    up: 1,
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    if (/^{"code":0/.test(responseText)) {
                        Tooltip.log('[自动点赞]点赞成功');
                    } else {
                        Tooltip.warn(`[自动点赞]点赞失败,请在"错误信息"处手动处理\n${responseText}`);
                        errorbar.appendChild(Base.createCompleteElement({
                            tagname: 'a',
                            attr: {
                                href: `https://t.bilibili.com/${dyid}`,
                                target: "_blank",
                                style: "display: block;",
                                title: '点击访问5s后自动移除'
                            },
                            script: (el) => {
                                el.addEventListener('click', () => {
                                    setTimeout(() => {
                                        el.parentNode.removeChild(el);
                                    }, 5000)
                                })
                            },
                            text: `未成功点赞的动态|动态id:${dyid}`,
                        }))
                    }
                }
            })
        },
        /**
         * 转发前因查看是否重复转发
         * 自动转发
         * @param {Number} uid
         * 自己的UID
         * @param {string} dyid
         * @param {string} [msg]
         * 动态的ID
         * @returns {void}
         */
        autoRelay: (uid, dyid, msg = '转发动态', ctrl = '[]') => {
            const len = msg.length;
            if (len > 233) {
                msg = msg.slice(0, 233 - len)
            }
            Ajax.post({
                url: 'https://api.vc.bilibili.com/dynamic_repost/v1/dynamic_repost/repost',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    uid: `${uid}`,
                    dynamic_id: dyid,
                    content: msg,
                    ctrl,
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    if (/^{"code":0/.test(responseText)) {
                        Tooltip.log('[转发动态]成功转发一条动态');
                    } else {
                        Tooltip.warn(`[转发动态]转发动态失败,请在"错误信息"处手动处理\n${responseText}`);
                        GlobalVar.deleteLotteryInfo(dyid); /* 转发失败自动移除 */
                        errorbar.appendChild(Base.createCompleteElement({
                            tagname: 'a',
                            attr: {
                                href: `https://t.bilibili.com/${dyid}`,
                                target: "_blank",
                                style: "display: block;",
                                title: '点击访问5s后自动移除'
                            },
                            script: (el) => {
                                el.addEventListener('click', () => {
                                    setTimeout(() => {
                                        el.parentNode.removeChild(el);
                                    }, 5000)
                                })
                            },
                            text: `未成功转发的动态|动态id:${dyid}`,
                        }))
                    }
                }
            })
        },
        /**
         * @typedef Picture
         * @property {string} img_src
         * @property {number} img_width
         * @property {number} img_height
         * 发布一条动态
         * @param { string | Picture[] } content
         * @return {Promise<void>}
         */
        createDynamic: (content) => {
            let data = {
                csrf: GlobalVar.csrf,
                extension: '{"emoji_type":1,"from":{"emoji_type":1},"flag_cfg":{}}'
            }
            let url = '';
            if (content instanceof Array) {
                url = 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/create_draw'
                data = {
                    ...data,
                    biz: 3,
                    category: 3,
                    pictures: JSON.stringify(content)
                }
            } else {
                url = 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/create'
                data = {
                    ...data,
                    content,
                }
            }
            return new Promise((resolve) => {
                Ajax.post({
                    url,
                    hasCookies: true,
                    dataType: 'application/x-www-form-urlencoded',
                    data,
                    success: responseText => {
                        if (/^{"code":0/.test(responseText)) {
                            Base.tooltip.log('[发布动态]成功创建一条随机内容的动态');
                        } else {
                            Base.tooltip.warn(`[发布动态]发布动态失败\n${responseText}`);
                        }
                        resolve()
                    }
                })
            });
        },
        /**
         * 移除动态
         * @param {string} dyid
         * @returns {void}
         */
        rmDynamic: dyid => {
            Ajax.post({
                url: 'https://api.vc.bilibili.com/dynamic_svr/v1/dynamic_svr/rm_dynamic',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    dynamic_id: dyid,
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    if (/^{"code":0/.test(responseText)) {
                        Tooltip.log('[删除动态]成功删除一条动态');
                    } else {
                        Tooltip.warn(`[删除动态]删除动态失败\n${responseText}`);
                    }
                }
            })
        },
        /**
         * 发送评论
         * @param {string} rid
         * cid_str
         * @param {string} msg
         * @param {number} type
         * 1(视频)  
         * 11(有图)  
         * 17(无图)  
         * @param {boolean} show
         * @param {string} dyid
         * @returns
         */
        sendChat: (rid, msg, type, show, dyid = '') => {
            Ajax.post({
                url: 'https://api.bilibili.com/x/v2/reply/add',
                hasCookies: true,
                dataType: 'application/x-www-form-urlencoded',
                data: {
                    oid: rid,
                    type: type,
                    message: msg,
                    ordering: 'heat',
                    csrf: GlobalVar.csrf
                },
                success: responseText => {
                    if (/^{"code":0/.test(responseText)) {
                        show ? Tooltip.log('[自动评论]评论成功') : void 0;
                    } else {
                        show ? Tooltip.warn(`[自动评论]评论失败,请在"错误信息"处手动评论\n${responseText}`) : void 0;
                        errorbar.appendChild(Base.createCompleteElement({
                            tagname: 'a',
                            attr: {
                                href: `https://t.bilibili.com/${dyid}`,
                                target: "_blank",
                                style: "display: block;",
                                title: '点击访问5s后自动移除'
                            },
                            script: (el) => {
                                el.addEventListener('click', () => {
                                    setTimeout(() => {
                                        el.parentNode.removeChild(el);
                                    }, 5000)
                                })
                            },
                            text: `未成功评论的动态|动态id:${dyid}`,
                        }))
                    }
                }
            })
        },
        /**
         * 检查分区  
         * 不存在指定分区时创建  
         * 获取到tagid添加为对象的属性  
         * @returns {Promise<number>}
         */
        checkMyPartition: (name = '此处存放因抽奖临时关注的up') => {
            return new Promise((resolve) => {
                Ajax.get({
                    url: 'https://api.bilibili.com/x/relation/tags',
                    hasCookies: true,
                    success: responseText => {
                        const res = Base.strToJson(responseText);
                        let tagid = undefined;
                        if (res.code === 0) {
                            const data = res.data.filter((it) => it.name === name);
                            if (data.length) {
                                Tooltip.log('[获取分区id]成功');
                                tagid = data[0].tagid
                            } else {
                                Tooltip.log('[获取分区id]失败 无指定分区');
                            }
                            if (name === '此处存放因抽奖临时关注的up') {
                                typeof tagid === 'undefined' ? BiliAPI.createPartition(name).then(id => resolve(id))
                                    : Base.storage.set(`${GlobalVar.myUID}tagid`, tagid).then(() => resolve(tagid))
                            } else {
                                resolve(tagid)
                            }
                        } else {
                            if (name === '此处存放因抽奖临时关注的up') {
                                Tooltip.log(`[获取分区id]访问出错,尝试从本地存储中获取\n${responseText}`);
                                Base.storage.get(`${GlobalVar.myUID}tagid`).then(td => {
                                    if (td) {
                                        Tooltip.log('[获取分区id]成功');
                                        resolve(Number(td));
                                    } else {
                                        console.log('本地未存储');
                                        resolve(tagid)
                                    }
                                })
                            } else {
                                Tooltip.warn(`[获取分区id]访问出错\n${responseText}`)
                                resolve(tagid)
                            }
                        }
                    }
                })
            });
        },
        /**
         * 创造分区
         * @param {string} partition_name
         * @returns {Promise<number>}
         */
        createPartition: (partition_name) => {
            return new Promise((resolve) => {
                Ajax.post({
                    url: 'https://api.bilibili.com/x/relation/tag/create',
                    hasCookies: true,
                    dataType: 'application/x-www-form-urlencoded',
                    data: {
                        tag: partition_name,
                        csrf: GlobalVar.csrf
                    },
                    success: responseText => {
                        let obj = Base.strToJson(responseText);
                        if (obj.code === 0) {
                            Tooltip.log('[新建分区]分区新建成功')
                            let { tagid } = obj.data /* 获取tagid */
                            Base.storage.set(`${GlobalVar.myUID}tagid`, tagid)
                            resolve(tagid)
                        } else {
                            Tooltip.warn(`[新建分区]分区新建失败\n${responseText}`);
                            resolve(undefined);
                        }
                    }
                })
            })
        }
    }
    /**
     * 贮存全局变量
     */
    const GlobalVar = (() => {
        const [myUID, csrf] = (() => {
            let Var = {};
            document.cookie.split(/\s*;\s*/).forEach(item => {
                const _item = item.split('=');
                if (['DedeUserID', 'bili_jct'].indexOf(_item[0]) !== -1) Var[_item[0]] = _item[1];
            })
            return [Var.DedeUserID, Var.bili_jct]
        })();
        /**
         * 获取本地存储信息
         * 格式-> `odyid:[dyid, ts, origin_uid]`
         * @returns {Promise<string>}
         */
        async function getAllMyLotteryInfo() {
            const allMyLotteryInfo = await Base.storage.get(myUID);
            if (typeof allMyLotteryInfo === 'undefined') {
                Tooltip.log('第一次使用,初始化中...');
                let alldy = (await Public.prototype.checkAllDynamic(myUID, 50)).allModifyDynamicResArray;
                let obj = {};
                for (let index = 0; index < alldy.length; index++) {
                    const { dynamic_id, origin_dynamic_id, origin_uid } = alldy[index];
                    if (typeof origin_dynamic_id === 'string') {
                        obj[origin_dynamic_id] = [dynamic_id, 0, origin_uid]
                    }
                }
                await Base.storage.set(myUID, JSON.stringify(obj));
                Tooltip.log('初始化成功');
            } else {
                return allMyLotteryInfo
            }
        }
        return {
            /**自己的UID*/
            myUID,
            /**防跨站请求伪造*/
            csrf,
            getAllMyLotteryInfo,
            /**
             * 增加动态信息
             * @param {string|''} dyid
             * @param {string} odyid
             * @param {number|0} ts
             * @param {number} ouid 
             * @example
             * odyid: [dyid, ts, ouid]
             */
            addLotteryInfo: async (dyid, odyid, ts, ouid) => {
                const allMyLotteryInfo = await getAllMyLotteryInfo();
                let obj = JSON.parse(allMyLotteryInfo);
                Object.prototype.hasOwnProperty.call(obj, odyid) ? void 0 : obj[odyid] = [];
                const [_dyid, _ts] = [obj[odyid][0], obj[odyid][1]];
                obj[odyid][0] = typeof _dyid === 'undefined' ? dyid : dyid === '' ? _dyid : dyid;
                obj[odyid][1] = typeof _ts === 'undefined' ? ts : ts === 0 ? _ts : ts;
                obj[odyid][2] = ouid;
                await Base.storage.set(myUID, JSON.stringify(obj));
                Tooltip.log(`更新本地数据`);
                return;
            },
            /**
             * 移除一条动态信息
             * @param {string} odyid
             */
            deleteLotteryInfo: async (odyid) => {
                const allMyLotteryInfo = await getAllMyLotteryInfo();
                let obj = JSON.parse(allMyLotteryInfo);
                delete obj[odyid];
                await Base.storage.set(myUID, JSON.stringify(obj));
                Tooltip.log(`本地移除dyid:${odyid}`);
                return;
            },
        };
    })()
    /**
     * 基础功能
     */
    class Public {
        constructor() { }
        /**
         * 提取出的有用动态信息
         * @typedef {object} UsefulDynamicInfo
         * @property {number} uid
         * @property {string} uname
         * @property {boolean} official_verify
         * @property {number} createtime
         * @property {string} rid_str
         * @property {string} dynamic_id
         * @property {number} type
         * @property {string} description
         * @property {boolean} hasOfficialLottery
         * @property {Array<Object.<string,string|number>>} ctrl
         * 
         * @property {number} origin_uid
         * @property {string} origin_uname
         * @property {boolean} origin_official_verify
         * @property {string} origin_rid_str
         * @property {string} origin_dynamic_id
         * @property {number} orig_type
         * @property {string} origin_description
         * @property {boolean} origin_hasOfficialLottery
         */
        /**
         * 检查所有的动态信息
         * @param {string} UID 指定的用户UID
         * @param {number} pages 读取页数
         * @param {number} time 时延
         * @param {string} [_offset] 默认'0'
         * @returns {Promise<{allModifyDynamicResArray: UsefulDynamicInfo[];offset: string}>} 获取前 `pages*12` 个动态信息
         */
        async checkAllDynamic(hostuid, pages, time = 0, _offset = '0') {
            Tooltip.log(`准备读取${pages}页${hostuid}的动态信息`);
            const mDR = this.modifyDynamicRes,
                getOneDynamicInfoByUID = BiliAPI.getOneDynamicInfoByUID,
                curriedGetOneDynamicInfoByUID = Base.curryify(getOneDynamicInfoByUID); /* 柯里化的请求函数 */
            /**
             * 储存了特定UID的请求函数
             */
            let hadUidGetOneDynamicInfoByUID = curriedGetOneDynamicInfoByUID(hostuid);
            /**
             * 储存所有经过整理后信息
             * [{}{}...{}]
             */
            let allModifyDynamicResArray = [];
            let offset = _offset;
            for (let i = 0; i < pages; i++) {
                Tooltip.log(`正在读取第${i + 1}页动态`);
                let OneDynamicInfo = await hadUidGetOneDynamicInfoByUID(offset);
                const mDRdata = mDR(OneDynamicInfo);
                if (mDRdata === null) {
                    break;
                }
                /**
                 * 储存一片动态信息
                 * [{}{}...{}]
                 */
                const mDRArry = mDRdata.modifyDynamicResArray,
                    nextinfo = mDRdata.nextinfo;
                if (nextinfo.has_more === 0) {
                    offset = nextinfo.next_offset;
                    Tooltip.log(`成功读取${i + 1}页信息(已经是最后一页了故无法读取更多)`);
                    break;
                } else {
                    allModifyDynamicResArray.push.apply(allModifyDynamicResArray, mDRArry);
                    i + 1 < pages ? Tooltip.log(`开始读取第${i + 2}页动态信息`) : Tooltip.log(`${pages}页信息全部成功读取完成`);
                    offset = nextinfo.next_offset;
                }
                await Base.delay(time);
            }
            return ({ allModifyDynamicResArray, offset });
        }
        /**
         * 互动抽奖  
         * 处理来自动态页面的数据
         * @param {String} res
         * @returns {{modifyDynamicResArray: UsefulDynamicInfo[];nextinfo: {has_more: number;next_offset: string;};} | null}
         */
        modifyDynamicRes(res) {
            const strToJson = Base.strToJson,
                jsonRes = strToJson(res),
                { data } = jsonRes;
            if (jsonRes.code !== 0) {
                Tooltip.warn('获取动态数据出错,可能是访问太频繁');
                return null;
            }
            /* 字符串防止损失精度 */
            const offset = typeof data.offset === 'string' ? data.offset : /next_offset":([0-9]*)/.exec(res)[1]
                , next = {
                    has_more: data.has_more,
                    next_offset: offset
                };
            /**
             * 储存获取到的一组动态中的信息
             */
            let array = [];
            if (next.has_more === 0) {
                Tooltip.log('动态数据读取完毕');
            } else {
                /**
                 * 空动态无cards
                 */
                const Cards = data.cards;
                Cards.forEach(onecard => {
                    /**临时储存单个动态中的信息 */
                    let obj = {};
                    const { desc, card } = onecard
                        , { info, card: user_profile_card } = desc.user_profile
                        , { official_verify } = user_profile_card
                        , cardToJson = strToJson(card);
                    obj.uid = info.uid; /* 转发者的UID */
                    obj.uname = info.uname;/* 转发者的name */
                    obj.official_verify = official_verify.type > -1 ? true : false; /* 是否官方号 */
                    obj.createtime = desc.timestamp /* 动态的ts10 */
                    obj.type = desc.type /* 动态类型 */
                    obj.rid_str = desc.rid_str.length > 12 ? desc.dynamic_id_str : desc.rid_str;/* 用于发送评论 */
                    obj.orig_type = desc.orig_type /* 源动态类型 */
                    obj.dynamic_id = desc.dynamic_id_str; /* 转发者的动态ID !!!!此为大数需使用字符串值,不然JSON.parse()会有丢失精度 */
                    const { extension, extend_json } = onecard;
                    obj.ctrl = (typeof extend_json === 'undefined') ? [] : strToJson(extend_json).ctrl || []; /* 定位@信息 */
                    obj.hasOfficialLottery = (typeof extension === 'undefined') ? false : typeof extension.lott === 'undefined' ? false : true; /* 是否有官方抽奖 */
                    const item = cardToJson.item || {};
                    obj.description = item.content || item.description || ''; /* 转发者的描述 */
                    if (obj.type === 1) {
                        obj.origin_uid = desc.origin.uid; /* 被转发者的UID */
                        obj.origin_rid_str = desc.origin.rid_str.length > 12 ? desc.origin.dynamic_id_str : desc.origin.rid_str; /* 被转发者的rid(用于发评论) */
                        obj.origin_dynamic_id = desc.orig_dy_id_str; /* 被转发者的动态的ID !!!!此为大数需使用字符串值,不然JSON.parse()会有丢失精度 */
                        const { origin_extension, origin_user } = cardToJson;
                        try {
                            obj.origin_official_verify = typeof origin_user === 'undefined' ?
                                false : origin_user.card.official_verify.type < 0 ?
                                    false : true; /* 是否官方号 */
                        } catch (error) {
                            obj.origin_official_verify = false;
                        }
                        obj.origin_hasOfficialLottery = typeof origin_extension === 'undefined' ?
                            false : typeof origin_extension.lott === 'undefined' ?
                                false : true; /* 是否有官方抽奖 */
                        const origin = cardToJson.origin || '{}';
                        const { user, item } = strToJson(origin);
                        obj.origin_uname = typeof user === 'undefined' ? '' : user.name || user.uname || ''; /* 被转发者的name */
                        obj.origin_description = typeof item === 'undefined' ? '' : item.content || item.description || ''; /* 被转发者的描述 */
                    }
                    array.push(obj);
                });
            }
            return {
                modifyDynamicResArray: array,
                nextinfo: next
            };
        }
        /**
         * @typedef {object} LotteryInfo
         * @property {string} lottery_info_type
         * @property {number[]} uids `[uid,ouid]`
         * @property {string} uname
         * @property {Array<{}>} ctrl
         * @property {string} dyid
         * @property {boolean} befilter
         * @property {boolean} official_verify 官方认证
         * @property {string} rid
         * @property {string} des
         * @property {number} type
         * @property {boolean} hasOfficialLottery 是否官方
         */
        /**
         * 获取tag下的抽奖信息(转发母动态)  
         * 并初步整理
         * @param {string} tag_name
         * @returns {Promise<LotteryInfo[] | null>}
         */
        async getLotteryInfoByTag(tag_name) {
            const self = this,
                tag_id = await BiliAPI.getTagIDByTagName(tag_name),
                hotdy = await BiliAPI.getHotDynamicInfoByTagID(tag_id),
                modDR = self.modifyDynamicRes(hotdy);
            if (modDR === null) return null;
            Tooltip.log(`开始获取带话题#${tag_name}#的动态信息`);
            let mDRdata = modDR.modifyDynamicResArray; /* 热门动态 */
            let next_offset = modDR.nextinfo.next_offset;
            for (let index = 0; index < 6; index++) {
                const newdy = await BiliAPI.getOneDynamicInfoByTag(tag_name, next_offset);
                const _modify = self.modifyDynamicRes(newdy);
                if (_modify === null) return null;
                mDRdata.push.apply(mDRdata, _modify.modifyDynamicResArray);
                next_offset = _modify.nextinfo.next_offset;
            }
            const fomatdata = mDRdata.map(o => {
                const hasOrigin = o.type === 1;
                return {
                    lottery_info_type: 'tag',
                    uids: [o.uid, o.origin_uid],
                    uname: o.uname,
                    ctrl: o.ctrl,
                    dyid: o.dynamic_id,
                    official_verify: o.official_verify,
                    befilter: hasOrigin,
                    rid: o.rid_str,
                    des: o.description,
                    type: o.type,
                    hasOfficialLottery: o.hasOfficialLottery
                };
            })
            Tooltip.log(`成功获取带话题#${tag_name}#的动态信息`);
            return fomatdata
        }
        /**
         * 获取最新动态信息(转发子动态)  
         * 并初步整理
         * @param {string} UID
         * @returns {Promise<LotteryInfo[] | null>}
         */
        async getLotteryInfoByUID(UID) {
            Tooltip.log(`开始获取用户${UID}的动态信息`);
            const { allModifyDynamicResArray: aMDRA } = await this.checkAllDynamic(UID, 6, 500);
            if (!aMDRA.length) return null;
            const fomatdata = aMDRA.map(o => {
                return {
                    lottery_info_type: 'uid',
                    uids: [o.uid, o.origin_uid],
                    uname: o.origin_uname,
                    ctrl: [],
                    dyid: o.origin_dynamic_id,
                    official_verify: o.origin_official_verify,
                    befilter: false,
                    rid: o.origin_rid_str,
                    des: o.origin_description,
                    type: o.orig_type,
                    hasOfficialLottery: o.origin_hasOfficialLottery
                }
            }).filter(a => a.type === 0 ? false : true)
            Tooltip.log(`成功获取用户${UID}的动态信息`);
            return fomatdata;
        }
    }
    /**
     * 监视器
     */
    class Monitor extends Public {
        /**
         * @constructor
         * @param {number | string} param
         */
        constructor(param) {
            super();
            typeof param === 'number' ? this.UID = param : this.tag_name = param;
            this.tagid = 0; /* tagid初始化为默认分组 */
            this.attentionList = ''; /* 转为字符串的所有关注的up主uid */
            this.AllMyLotteryInfo = '' /* 转发过的动态信息 */
        }
        /**
         * 初始化
         */
        async init() {
            if (config.model === '00') { Tooltip.log('已关闭所有转发行为'); return }
            const tagid = await BiliAPI.checkMyPartition();
            if (typeof tagid === 'undefined') { Tooltip.warn('未能成功获取关注分区id'); return }
            this.tagid = tagid; /* 检查关注分区 */
            this.attentionList = await BiliAPI.getAttentionList(GlobalVar.myUID);
            this.AllMyLotteryInfo = Object.keys(Base.strToJson(await GlobalVar.getAllMyLotteryInfo())).toString();
            const isAdd = await this.startLottery();
            if (isAdd) {
                let cADynamic = (await this.checkAllDynamic(GlobalVar.myUID, 5)).allModifyDynamicResArray; /* 检查我的所有动态 */
                /**
                 * 储存转发过的动态信息
                 */
                for (let index = 0; index < cADynamic.length; index++) {
                    const { type, dynamic_id, origin_dynamic_id, origin_description, origin_uid } = cADynamic[index];
                    if (type === 1 && typeof origin_description !== 'undefined') {
                        await GlobalVar.addLotteryInfo(dynamic_id, origin_dynamic_id, 0, origin_uid)
                    }
                }
                await this.clearDynamic();
            }
        }
        /**
         * 启动
         * @returns {Promise<boolean>}
         */
        async startLottery() {
            const allLottery = await this.filterLotteryInfo();
            const len = allLottery.length;
            Tooltip.log(`将转发${len}条动态`);
            for (const Lottery of allLottery) {
                await this.go(Lottery);
            }
            Tooltip.log('开始转发下一组动态');
            eventBus.emit('Turn_on_the_Monitor');
            return len ? true : false
        }
        /**
         * 保持5000条动态
         */
        async clearDynamic() {
            const AllMyLotteryInfo = JSON.parse(await GlobalVar.getAllMyLotteryInfo());
            const keyArr = Object.keys(AllMyLotteryInfo);
            if (keyArr.length > 5000) {
                Tooltip.log('已储存5000条消息,开始删除最初转发的内容');
                for (let i = 0; i < keyArr.length - 1000; i++) {
                    let dyid = AllMyLotteryInfo[keyArr[i]][0];
                    GlobalVar.deleteLotteryInfo(keyArr[i]);
                    BiliAPI.rmDynamic(dyid);
                }
            }
        }
        /**
         * 抽奖配置
         * @typedef {object} LotteryOptions
         * @property {number[]} uid 用户标识
         * @property {string} dyid 动态标识
         * @property {number} type 动态类型
         * @property {string} relay_chat 动态类型
         * @property {string} ctrl 定位@
         * @property {string} rid 评论类型
         */
        /**
         * @returns {Promise<LotteryOptions[] | []>
        }
         */
        async filterLotteryInfo() {
            const self = this,
                protoLotteryInfo = typeof self.UID === 'number' ?
                    await self.getLotteryInfoByUID(self.UID) :
                    await self.getLotteryInfoByTag(self.tag_name);
            let _protoLotteryInfo = [];
            if (protoLotteryInfo === null) return [];
            let alllotteryinfo = [];
            const { model, chatmodel, only_followed, maxday: _maxday, minfollower, blockword, blacklist } = config;
            const maxday = _maxday === '-1' || _maxday === '' ? Infinity : (Number(_maxday) * 86400);
            for (const info of protoLotteryInfo) {
                const { lottery_info_type, uids, uname, dyid, official_verify, ctrl, befilter, rid, des, type, hasOfficialLottery } = info;
                /**判断是否重复 */
                let isRepeat = false;
                for (const i of _protoLotteryInfo) {
                    if (dyid === i.dyid || (des && des === i.des)) {
                        isRepeat = true;
                        break;
                    }
                }
                if (isRepeat) continue;
                _protoLotteryInfo.push(info);
                /**判断是转发源动态还是现动态 */
                const uid = lottery_info_type === 'tag' ? uids[0] : uids[1];
                const now_ts_10 = Date.now() / 1000;
                let onelotteryinfo = {};
                let isLottery = false;
                let isSendChat = false;
                let isBlock = false;
                let ts = 0;
                const description = typeof des === 'string' ? des : '';
                for (let index = 0; index < blockword.length; index++) {
                    const word = blockword[index];
                    const reg = new RegExp(word);
                    isBlock = reg.test(description) ? true : false;
                    if (isBlock) break;
                }
                if (isBlock) continue;
                const needAt = /(?:@|艾特)[^@|(艾特)]*?好友/.test(description);
                const needTopic = (/[带加上](?:话题|tag)(#.*#)/i.exec(description) || [])[1];
                const isTwoLevelRelay = /\/\/@/.test(description);
                const haslottery = /[抽奖]/.test(description);
                const hasGuanZhuan = /[转关].*[转关]/.test(description);
                if (hasOfficialLottery && model[0] === '1') {
                    const oneLNotice = await BiliAPI.getLotteryNotice(dyid);
                    ts = oneLNotice.ts;
                    isLottery = ts > now_ts_10 && ts < now_ts_10 + maxday;
                    isSendChat = chatmodel[0] === '1';
                } else if (!hasOfficialLottery && model[1] === '1' && haslottery && hasGuanZhuan && !isTwoLevelRelay) {
                    ts = Base.getLotteryNotice(description).ts;
                    if (!official_verify) {
                        const followerNum = await BiliAPI.getUserInfo(uid);
                        if (followerNum < Number(minfollower)) continue;
                        isLottery = !befilter && (ts === 0 || (ts > now_ts_10 && ts < now_ts_10 + maxday));
                    } else {
                        isLottery = ts === 0 || (ts > now_ts_10 && ts < now_ts_10 + maxday);
                    }
                    isSendChat = chatmodel[1] === '1';
                }
                if (isLottery) {
                    /* 判断是否关注过 */
                    const isFollowed = (new RegExp(uid)).test(self.attentionList);
                    /* 判断是否转发过 */
                    const isRelay = (new RegExp(dyid)).test(self.AllMyLotteryInfo);
                    if (only_followed === '1' && !isFollowed) continue;
                    if ((new RegExp(dyid + '|' + uid)).test(blacklist)) continue;
                    onelotteryinfo.uid = [] /**初始化待关注列表 */
                    if (!isFollowed) onelotteryinfo.uid.push(uid);
                    if (!isRelay) {
                        onelotteryinfo.dyid = dyid;
                        let RandomStr = Base.getRandomOne(config.relay);
                        let new_ctrl = [];
                        if (needTopic) {
                            RandomStr += needTopic
                        }
                        if (needAt) {
                            /**如要修改请手动填写 */
                            const _at = [
                                ['转发抽奖娘', 294887687],
                                ['你的工具人老公', 100680137]
                            ];
                            _at.forEach(it => {
                                new_ctrl.push({
                                    data: String(it[1]),
                                    location: RandomStr.length,
                                    length: it[0].length + 1,
                                    type: 1
                                })
                                RandomStr += '@' + it[0]
                            })
                        }
                        if (type === 1) {
                            /* 转发内容长度+'//'+'@'+用户名+':'+源内容 */
                            const addlength = RandomStr.length + 2 + uname.length + 1 + 1;
                            onelotteryinfo.relay_chat = RandomStr + `//@${uname}:` + des;
                            new_ctrl.push({
                                data: String(uid),
                                location: RandomStr.length + 2,
                                length: uname.length + 1,
                                type: 1
                            })
                            ctrl.map(item => {
                                item.location += addlength;
                                return item;
                            }).forEach(it => new_ctrl.push(it))
                            if (!(new RegExp(uids[1])).test(self.attentionList))
                                onelotteryinfo.uid.push(uids[1]);
                        } else {
                            onelotteryinfo.relay_chat = RandomStr;
                        }
                        onelotteryinfo.ctrl = JSON.stringify(new_ctrl);
                    }
                    /* 根据动态的类型决定评论的类型 */
                    onelotteryinfo.type = type === 2 ?
                        11 : type === 4 || type === 1 ?
                            17 : type === 8 ?
                                1 : 0;
                    /* 是否评论 */
                    isSendChat ? onelotteryinfo.rid = rid : void 0;
                    if (typeof onelotteryinfo.uid === 'undefined' && typeof onelotteryinfo.dyid === 'undefined') continue;
                    Tooltip.log('新增一条抽奖信息存于本地')
                    await GlobalVar.addLotteryInfo('', dyid, ts, uid);
                    alllotteryinfo.push(onelotteryinfo);
                }
            }
            return alllotteryinfo
        }
        /**
         * 关注转发评论
         * @param {LotteryOptions} option
         */
        async go(option) {
            const { uid, dyid, type, rid, relay_chat, ctrl } = option;
            if (typeof dyid === 'string') {
                BiliAPI.autoRelay(GlobalVar.myUID, dyid, relay_chat, ctrl);
                BiliAPI.autolike(dyid);
                uid.forEach(async (one_uid) => {
                    if (typeof one_uid === 'number') {
                        await BiliAPI.autoAttention(one_uid);
                        await Base.delay(3000);
                        BiliAPI.movePartition(one_uid, this.tagid);
                    }
                })
                if (typeof rid === 'string' && type !== 0) {
                    BiliAPI.sendChat(rid, Base.getRandomOne(config.chat) || relay_chat, type, true, dyid);
                }
                await Base.delay(Number(config.wait));
            }
            return;
        }
    }
    /**
     * 主菜单
     */
    class MainMenu extends Public {
        constructor() {
            super();
            this.offset = '0';
        }
        init() {
            this.initUI();
            this.eventListener();
        }
        initUI() {
            const createCompleteElement = Base.createCompleteElement
                , cssContent = `.shanmitemenu{position:fixed;-webkit-user-select:none;z-index:99999;right:30px;top:90%}.shanmitemenu .icon{background-position:0 -8.375em;width:.425em;height:.4em;vertical-align:middle;display:inline-block;background-image:url(https://s1.hdslb.com/bfs/seed/bplus-common/icon/2.2.1/bp-svg-icon.svg);background-repeat:no-repeat;background-size:1em 23.225em;font-size:80px;border:2px dashed skyblue;font-style:italic}.shanmitemenu .show{position:relative;overflow:hidden;padding-left:0;line-height:35px;transition:.3s all .1s cubic-bezier(0,.53,.15,.99);cursor:pointer;color:#178bcf}.shanmitemenu .show:hover{padding-left:130px}.shanmitemenu .box{position:absolute;right:45px;bottom:35px;background-color:#e5f4fb;padding:5px;border-radius:5px;box-shadow:grey 0 0 10px 0;width:550px;height:500px}.shanmitemenu button{background-color:#23ade5;color:#fff;border-radius:4px;border:none;padding:5px;margin:4px;box-shadow:0 0 2px #00000075;line-height:14px}.shanmitemenu button:hover{background-color:#14a0d8}.shanmitemenu button:active{background-color:#0e8bbd;margin-right:4px;margin-bottom:3px}.shanmitemenu button:focus{outline:none}.shanmitemenu [type="checkbox"]{margin-inline:4px;vertical-align:middle}.shanmitemenu [type="number"]{margin-inline-end:4px;vertical-align:middle;outline:none;border:1px solid #6d757a;border-radius:4px}.shanmitemenu textarea{outline:none;border:1px solid #6d757a;border-radius:4px;resize:none}.shanmitemenu .changetab{display:flex;-webkit-user-select:none}.shanmitemenu .changetab div{margin:0 0 0 10px;padding:3px;border-radius:6px;border:2px solid #26c6da;font-size:14px;cursor:pointer;transition:background-color .3s ease 0s;background-color:#87cfeb80}.shanmitemenu .changetab div:hover{background-color:skyblue}.shanmitemenu .changetab div:active{border-color:#17abe6;background-color:#17abe6;position:relative;top:1px}.shanmitemenu .tab{display:none;overflow:hidden;overflow-y:scroll;height:460px;margin:3px}.shanmitemenu .tab .card{font-size:15px;margin:15px;padding:5px;border-radius:5px;background-color:#ffffff;box-shadow:gray 0 0 4px 0}.shanmitemenu .bottom{display:flex;justify-content:flex-end;align-items:flex-end}.shanmitemenu .bottom button{margin-left:10px}`
                , frg = createCompleteElement({
                    tagname: 'div',
                    attr: {
                        class: 'shanmitemenu',
                    },
                    text: '',
                    children: [
                        createCompleteElement({
                            tagname: 'style',
                            attr: {
                                type: 'text/css'
                            },
                            text: cssContent,
                        }),
                        createCompleteElement({
                            tagname: 'div',
                            attr: {
                                title: 'Bili互动抽奖助手',
                                class: 'show',
                            },
                            children: [
                                createCompleteElement({
                                    tagname: 'span',
                                    attr: {
                                        id: 'showall',
                                        style: 'position:absolute;right: 2em;width: 6em;font-size: 20px;'
                                    },
                                    text: '动态抽奖助手',
                                }),
                                createCompleteElement({
                                    tagname: 'i',
                                    attr: {
                                        id: 'showall',
                                        class: 'icon',
                                    },
                                })
                            ]
                        }),
                        createCompleteElement({
                            tagname: 'div',
                            attr: {
                                class: 'box',
                                style: 'display: none;'
                            },
                            children: [
                                createCompleteElement({
                                    tagname: 'div',
                                    attr: {
                                        class: 'changetab',
                                    },
                                    children: [
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                id: 'showtab0',
                                            },
                                            text: '开奖信息',
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                id: 'showtab1',
                                            },
                                            text: '清理动态',
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                id: 'showtab2',
                                            },
                                            text: '错误信息',
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                id: 'showtab3',
                                            },
                                            text: '设置',
                                        }),
                                    ]
                                }),
                                createCompleteElement({
                                    tagname: 'div',
                                    attr: {
                                        class: 'tabs',
                                    },
                                    children: [
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                class: 'tab info',
                                            },
                                            children: [
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        title: '加载全部(wait 1s)',
                                                        id: 'autoscroll',
                                                        style: 'position: absolute;right: 30px;bottom: 80px;'
                                                    },
                                                    text: '加载全部',
                                                }),
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        title: '显示并刷新开奖信息',
                                                        id: 'showlottery',
                                                        style: 'position: absolute;right: 30px;bottom: 50px;'
                                                    },
                                                    text: '显示开奖',
                                                }),
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        title: '启动脚本',
                                                        id: 'lottery',
                                                        style: 'position: absolute;right: 30px;bottom: 20px;'
                                                    },
                                                    text: '启动脚本',
                                                }),
                                            ]
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                class: 'tab rmdy',
                                            },
                                            children: [
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        title: '仅移除动态',
                                                        id: 'rmdy',
                                                        style: 'position: absolute;right: 30px;bottom: 50px;'
                                                    },
                                                    text: '推荐模式',
                                                }),
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        title: '强力',
                                                        id: 'sudormdy',
                                                        style: 'position: absolute;right: 30px;bottom: 20px;'
                                                    },
                                                    text: '强力模式',
                                                }),
                                                createCompleteElement({
                                                    tagname: 'form',
                                                    attr: {
                                                        id: 'rmdyform',
                                                    },
                                                    children: [
                                                        createCompleteElement({
                                                            tagname: 'h3',
                                                            text: '推荐模式:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '使用存储在本地的动态id和开奖时间判断是否中奖, <br>若中奖会有弹窗提示, 否则移除已开奖的动态并取关up主。',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '<strong>需注意</strong>未填写白名单移除关注时会直接移除<br><br>',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'h3',
                                                            text: '强力模式:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '默认移除所有<strong>转发动态</strong>或临时关注的up, <br>使用前请在在白名单内填入不想移除的动态ID或up主的UID, <br>可定期使用此功能清空无法处理的动态和本地存储信息。',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '<strong>移除</strong>',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'page',
                                                                value: '5',
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '页后<br>以及',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'day',
                                                                value: '0',
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '天前<br>',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '转发的动态',
                                                            attr: {
                                                                style: 'padding-right: 10px'
                                                            },
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'radio',
                                                                        name: 'type',
                                                                        value: '1',
                                                                        checked: 'checked'
                                                                    },
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '所有动态',
                                                            attr: {
                                                                title: '包含普通动态和转发动态，不包括视频专栏活动等动态'
                                                            },
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'radio',
                                                                        name: 'type',
                                                                        value: '1||2||4'
                                                                    },
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '<br><strong>取关</strong>',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'text',
                                                                name: 'fenqu',
                                                                value: '此处存放因抽奖临时关注的up',
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '分区',
                                                        }),
                                                    ]
                                                })
                                            ]
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                class: 'tab error',
                                            }
                                        }),
                                        createCompleteElement({
                                            tagname: 'div',
                                            attr: {
                                                class: 'tab config',
                                            },
                                            children: [
                                                createCompleteElement({
                                                    tagname: 'button',
                                                    attr: {
                                                        id: 'save',
                                                        style: 'position: absolute;right: 30px;bottom: 20px;'
                                                    },
                                                    text: '保存设置',
                                                }),
                                                createCompleteElement({
                                                    tagname: 'form',
                                                    attr: {
                                                        id: 'config',
                                                    },
                                                    children: [
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '当前版本' + Script.version + Script.author,
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'a',
                                                            attr: {
                                                                href: "https://github.com/shanmite/LotteryAutoScript",
                                                                target: '_blank'
                                                            },
                                                            text: '--> 云端版本 <--',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'h3',
                                                            text: '模式选择',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '转发官方抽奖',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'model'
                                                                    },
                                                                    script: el => {
                                                                        config.model[0] === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '转发非官方抽奖',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'model'
                                                                    },
                                                                    script: el => {
                                                                        config.model[1] === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'br',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '官方抽奖自动评论',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'chatmodel'
                                                                    },
                                                                    script: el => {
                                                                        config.chatmodel[0] === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '非官方抽奖自动评论',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'chatmodel'
                                                                    },
                                                                    script: el => {
                                                                        config.chatmodel[1] === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'br',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '仅转发已关注up的抽奖',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'only_followed'
                                                                    },
                                                                    script: el => {
                                                                        config.only_followed === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'br',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'label',
                                                            text: '发送一条动态防止被开奖机过滤',
                                                            children: [
                                                                createCompleteElement({
                                                                    tagname: 'input',
                                                                    attr: {
                                                                        type: 'checkbox',
                                                                        name: 'create_dy'
                                                                    },
                                                                    script: el => {
                                                                        config.create_dy === '1' ? el.checked = 'checked' : void 0;
                                                                    }
                                                                })
                                                            ]
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '开奖时间(默认-1:不限):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'maxday',
                                                                value: config.maxday
                                                            },
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '天内',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '再次扫描间隔(完成所有转发后进行停止等待,于指定时间间隔后再次进行操作):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'scan_time',
                                                                value: (Number(config.scan_time) / 60000).toString(),
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '分钟',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '转发间隔(每条动态的转发间隔时间):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'wait',
                                                                value: (Number(config.wait) / 1000).toString(),
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '秒',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: 'up主粉丝数至少:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'input',
                                                            attr: {
                                                                type: 'number',
                                                                name: 'minfollower',
                                                                value: config.minfollower,
                                                            }
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'span',
                                                            text: '人',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '动态描述屏蔽词(!注意!以下每一句用英文逗号分割):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'blockword',
                                                                title: "转发动态中的屏蔽词"
                                                            },
                                                            text: config.blockword.toString(),
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '此处存放黑名单(用户UID或动态的ID):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'blacklist',
                                                                title: "不再参与相关的的抽奖活动,动态的id指的是点进动态之后链接中的那一串数字,此处内容格式同上"
                                                            },
                                                            text: config.blacklist,
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '此处存放白名单(动态的ID 或 UP主的UID):',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'whitelist',
                                                                title: "批量取关删动态时的受保护名单,动态的id指的是点进动态之后链接中的那一串数字,此处内容格式同上"
                                                            },
                                                            text: config.whitelist,
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '转发动态评语',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'relay',
                                                                title: '可以自行增加@ 此处内容格式同上'
                                                            },
                                                            text: config.relay.toString(),
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '随机评论内容:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'chat',
                                                                title: '此处内容格式同上'
                                                            },
                                                            text: config.chat.toString(),
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '随机动态内容:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'dy_contents',
                                                                title: '此处内容格式详见云端版说明'
                                                            },
                                                            text: JSON.stringify(config.dy_contents),
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '监视的UID:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'UIDs',
                                                                title: '此处内容格式同上'
                                                            },
                                                            text: config.UIDs.toString(),
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'p',
                                                            text: '监视的话题:',
                                                        }),
                                                        createCompleteElement({
                                                            tagname: 'textarea',
                                                            attr: {
                                                                cols: '65',
                                                                rows: '10',
                                                                name: 'TAGs',
                                                                title: '此处内容格式同上'
                                                            },
                                                            text: config.TAGs.toString(),
                                                        }),
                                                    ]
                                                })
                                            ]
                                        }),
                                    ]
                                })
                            ]
                        })
                    ]
                });
            document.body.appendChild(frg);
        }
        eventListener() {
            const self = this
                , shanmitemenu = document.querySelector('.shanmitemenu')
                , showbutton = shanmitemenu.querySelector('.show')
                , box = shanmitemenu.querySelector('.box')
                , tabsarr = shanmitemenu.querySelectorAll('.tab')
                , infotab = shanmitemenu.querySelector('.tab.info')
                , configForm = shanmitemenu.querySelector('#config')
                , rmdyForm = shanmitemenu.querySelector('#rmdyform')
                , show = num => {
                    for (let index = 0; index < tabsarr.length; index++) {
                        const element = tabsarr[index];
                        element.style.display = index == num ? 'block' : 'none';
                    }
                };
            Base.storage.get('firstRun').then(firstRun => {
                if (typeof firstRun === 'undefined') {
                    /**初次运行时提示图标位置 */
                    Toollayer.tips(
                        '<span style="font-size:1.5em">点我打开主菜单</span>',
                        '.show',
                        1,
                        60e3,
                        true,
                        (_dom, index) => {
                            showbutton.onclick = () => {
                                console.log('click menu')
                                layer.close(index);
                                Base.storage.set('firstRun', false);
                                showbutton.onclick = null;
                            }
                        }
                    )
                }
            })
            errorbar = shanmitemenu.querySelector('.tab.error');
            show(0);
            tabsarr[0].addEventListener(
                'scroll',
                Base.throttle(async (ev) => {
                    const tab = ev.target;
                    if (tab.scrollHeight - tab.scrollTop <= 460 && self.offset !== '-1')
                        await self.sortInfoAndShow();
                }, 1000)
            );
            shanmitemenu.addEventListener('click', ev => {
                const id = ev.target.id;
                switch (id) {
                    case 'showall':
                        if (box.style.display == 'block') {
                            box.style.display = 'none';
                        } else {
                            show(0);
                            box.style.display = 'block';
                        }
                        break;
                    case 'showtab0':
                        show(0);
                        break;
                    case 'showtab1':
                        show(1);
                        break;
                    case 'showtab2':
                        show(2);
                        break;
                    case 'showtab3':
                        show(3);
                        break;
                    case 'lottery':
                        eventBus.emit('Turn_on_the_Monitor');
                        break;
                    case 'showlottery':
                        {
                            const childcard = infotab.querySelectorAll('.card');
                            this.offset = '0';
                            childcard.forEach(card => {
                                infotab.removeChild(card);
                            })
                            this.sortInfoAndShow();
                        }
                        break;
                    case 'autoscroll':
                        {
                            const childcard = infotab.querySelectorAll('.card')
                                , self = this;
                            self.offset = '0';
                            childcard.forEach(card => {
                                infotab.removeChild(card);
                            });
                            (async function autoscroll() {
                                await self.sortInfoAndShow();
                                await Base.delay(1000);
                                if (self.offset !== '-1')
                                    autoscroll()
                            })()
                        }
                        break;
                    case 'rmdy':
                        Toollayer.confirm(
                            '是否清理动态',
                            '将从本地存储中获取<code>dyid</code>和<code>uid</code><br>清理过程中将检测官抽是否中奖',
                            ['确定', '取消'],
                            () => {
                                let [i, j, k, time] = [0, 0, 0, 0];
                                const linkMsg = (link, msg = link) => '<a href="' + link + 'target="_blank" style = "color:#00a1d6;text-decoration:underline;">' + msg + '</a>';
                                const { whitelist } = config;
                                async function rm(model) {
                                    const str = await GlobalVar.getAllMyLotteryInfo()
                                        , AllMyLotteryInfo = JSON.parse(str);
                                    for (const odyid in AllMyLotteryInfo) {
                                        i++;
                                        const [dyid, ts, ouid] = AllMyLotteryInfo[odyid];
                                        if (ts === 0) continue;
                                        j++;
                                        if (ts > (Date.now() / 1000)) continue;
                                        k++;
                                        const { isMe } = await BiliAPI.getLotteryNotice(dyid);
                                        isMe === '中奖了！！！' ? Toollayer.alert('恭喜！！！中奖了', `前往 ${linkMsg(`https://t.bilibili.com/${dyid}`)} 查看。`) : Tooltip.log('未中奖');
                                        Tooltip.log(`移除过期官方或非官方动态${dyid}`);
                                        if (typeof dyid === 'string' && dyid !== '' && model[0] === '1' && !(new RegExp(dyid)).test(whitelist)) BiliAPI.rmDynamic(dyid);
                                        if (typeof ouid === 'number' && model[1] === '1' && !(new RegExp(ouid)).test(whitelist)) BiliAPI.cancelAttention(ouid);
                                        await GlobalVar.deleteLotteryInfo(odyid);
                                        await Base.delay(time * 1000);
                                    }
                                    Toollayer.alert('清理动态完毕', `<li>共查看<code>${i}</code>条动态</li><li>能识别开奖时间的:共<code>${j}</code>条 过期<code>${k}</code>条 未开奖<code>${j - k}</code>条</li>`);
                                }
                                const promptTime = (fn) => Toollayer.prompt(
                                    '输入停顿时间(单位秒)',
                                    0,
                                    (value) => {
                                        isNaN(value) ? (() => { Toollayer.msg('输入数据不是数字', 2000, 2) })()
                                            : (() => { time = Number(value); fn(); })();
                                    },
                                    6
                                );
                                Toollayer.confirm(
                                    '选择删除的内容',
                                    '从本地存储中读取转发过的动态',
                                    ['只删除动态', '删除动态并移除关注'],
                                    () => { promptTime(() => { rm('10') }) },
                                    () => { promptTime(() => { rm('11') }) }
                                );
                            },
                            () => { Toollayer.msg('已取消') }
                        );
                        break;
                    case 'sudormdy':
                        Toollayer.confirm(
                            '是否进入强力清除模式',
                            '请确认是否需要在白名单内填入不想移除的动态。<li>建议在关注数达到上限时使用本功能</li>',
                            ['确定', '取消'],
                            () => {
                                Toollayer.confirm('是否进入强力清除模式', '请再次确定', ['确定', '取消'],
                                    async () => {
                                        let offset = '0', time = 0, p1 = $.Deferred(), p2 = $.Deferred();
                                        const { whitelist } = config;
                                        const {
                                            day,
                                            page,
                                            type: dytype,
                                            fenqu
                                        } = rmdyForm;
                                        const _time = Date.now() / 1000 - Number(day.value) * 86400;
                                        const tagid = await BiliAPI.checkMyPartition(fenqu.value);
                                        async function delDynamic() {
                                            for (let index = 0; index < 1000; index++) {
                                                const { allModifyDynamicResArray, offset: _offset } = await self.checkAllDynamic(GlobalVar.myUID, 1, Number(time) * 1000, offset);
                                                offset = _offset;
                                                if (index < Number(page.value)) {
                                                    Tooltip.log(`跳过第${index}页(12条)`);
                                                } else {
                                                    Tooltip.log(`开始读取第${index}页(12条)`);
                                                    for (let index = 0; index < allModifyDynamicResArray.length; index++) {
                                                        const res = allModifyDynamicResArray[index];
                                                        const { type, createtime, dynamic_id } = res;
                                                        const dytypevalue = dytype.value;
                                                        if (type === 1 || (dytypevalue === '1||2||4' && (type === 2 || type === 4))) {
                                                            const reg1 = new RegExp(dynamic_id);
                                                            if (createtime < _time && !reg1.test(whitelist)) BiliAPI.rmDynamic(dynamic_id);
                                                            await Base.delay(Number(time) * 1000);
                                                        }
                                                    }
                                                    Tooltip.log(`第${index}页中的转发动态全部删除成功`)
                                                }
                                                if (offset === '0') break;
                                            }
                                            p1.resolve();
                                        }
                                        async function unFollow() {
                                            if (typeof tagid === 'undefined') { Tooltip.warn('未能成功获取关注分区id'); return }
                                            let rmup = [];
                                            for (let index = 1; index < 42; index++) {
                                                const uids = await BiliAPI.getPartitionUID(tagid, index);
                                                rmup.push(...uids);
                                                if (uids.length === 0) break;
                                            }
                                            for (let index = 0; index < rmup.length; index++) {
                                                const uid = rmup[index];
                                                const reg2 = new RegExp(uid);
                                                if (!reg2.test(whitelist)) BiliAPI.cancelAttention(uid);
                                                await Base.delay(Number(time) * 1000);
                                            }
                                            p2.resolve();
                                        }
                                        const promptTime = (fn) => Toollayer.prompt(
                                            '输入停顿时间(单位秒)',
                                            0,
                                            (value) => {
                                                isNaN(value) ? Toollayer.msg('输入数据不是数字', 2000, 2)
                                                    : (() => { time = Number(value); fn(); })();
                                            },
                                            6
                                        );
                                        Toollayer.confirm(
                                            '选择删除的内容',
                                            '移除动态和移除关注最好分开进行',
                                            ['只删除动态', '只移除关注', '删除动态并移除关注'],
                                            () => { p2.resolve(); promptTime(delDynamic) },
                                            () => { p1.resolve(); promptTime(unFollow) },
                                            () => { promptTime(() => { delDynamic(); unFollow() }) }
                                        );
                                        $.when(p1, p2).done(function () {
                                            Toollayer.confirm(
                                                '清除成功',
                                                '成功清除，感谢使用',
                                                ['确定'],
                                                () => {
                                                    Toollayer.confirm(
                                                        '是否清空本地存储',
                                                        '请点击确定以清空本地存储。之前转发过的内容会再次转发',
                                                        ['确定', '取消'],
                                                        () => { Base.storage.set(GlobalVar.myUID, '{}') },
                                                        () => { Toollayer.msg('已取消') }
                                                    )
                                                }
                                            );
                                        });
                                    },
                                    () => { Toollayer.msg('已取消') }
                                )
                            },
                            () => { Toollayer.msg('已取消') }
                        );
                        break;
                    case 'save': {
                        let newConfig = {
                            model: '',
                            chatmodel: '',
                            only_followed: '',
                            create_dy: '',
                            dy_contents: [],
                            maxday: '',
                            scan_time: '',
                            wait: '',
                            minfollower: '',
                            blockword: [],
                            blacklist: '',
                            whitelist: '',
                            relay: [],
                            chat: [],
                            UIDs: [],
                            TAGs: []
                        }
                        const {
                            model,
                            chatmodel,
                            only_followed,
                            create_dy,
                            dy_contents,
                            maxday,
                            scan_time,
                            wait,
                            minfollower,
                            blockword,
                            blacklist,
                            whitelist,
                            relay,
                            chat,
                            UIDs,
                            TAGs
                        } = configForm;
                        for (let i = 0; i < 2; i++) {
                            model[i].checked ? newConfig.model += '1' : newConfig.model += '0';
                            chatmodel[i].checked ? newConfig.chatmodel += '1' : newConfig.chatmodel += '0';
                        }
                        only_followed.checked ? newConfig.only_followed += '1' : newConfig.only_followed += '0';
                        create_dy.checked ? newConfig.create_dy += '1' : newConfig.create_dy += '0';
                        newConfig.maxday = Number(maxday.value) < 0 ? '-1' : maxday.value;
                        newConfig.scan_time = (Number(scan_time.value) * 60000).toString();
                        newConfig.wait = (Number(wait.value) * 1000).toString();
                        newConfig.minfollower = minfollower.value;
                        newConfig.blockword = blockword.value.split(',');
                        newConfig.blacklist = blacklist.value;
                        newConfig.whitelist = whitelist.value;
                        newConfig.dy_contents = JSON.parse(dy_contents.value);
                        newConfig.relay = relay.value.split(',');
                        newConfig.chat = chat.value.split(',');
                        newConfig.UIDs = UIDs.value.split(',');
                        newConfig.TAGs = TAGs.value.split(',');
                        config = newConfig;
                        eventBus.emit('Modify_settings', JSON.stringify(newConfig));
                    }
                        break;
                    case 'btn1':
                        BiliAPI.rmDynamic(ev.target.dataset.dyid);
                        BiliAPI.cancelAttention(ev.target.dataset.uid);
                        infotab.removeChild(ev.target.parentNode);
                        break;
                    case 'btn2':
                        BiliAPI.rmDynamic(ev.target.dataset.dyid)
                        infotab.removeChild(ev.target.parentNode);
                        break;
                    default:
                        break;
                }
            })
        }
        /**
         * 排序后展示
         * @returns {Promise<void>}
         */
        async sortInfoAndShow() {
            const self = this
            let protoArr = await this.fetchDynamicInfo();
            if (protoArr === []) return;
            /**
             * 按ts从小到大排序
             */
            protoArr.sort((a, b) => {
                return b.ts - a.ts;
            })
            protoArr.forEach(one => {
                if (one.ts === 0 || one.ts > Date.now() / 1000) {
                    self.creatLotteryDetailInfo(one, 'color:green;')
                } else {
                    self.creatLotteryDetailInfo(one, 'color:red;')
                }
            })
            return;
        }
        /**
         * 信息卡片数据
         * @typedef {object} InfoCard
         * @property {number | 0} ts 10位时间戳
         * @property {string | '非官方抽奖请自行查看'} text 文本信息
         * @property {string} item 奖品
         * @property {string} isMe 中奖信息
         * @property {string} dynamic_id
         * @property {string} origin_description
         * @property {number} origin_uid
         * @property {string} origin_uname
         * @property {string} origin_dynamic_id
         */
        /**
         * 提取所需的信息
         * @return {Promise<InfoCard[]>} 
         */
        async fetchDynamicInfo() {
            let allMDResArray = await this.getNextDynamic();
            /**
             * 滤出抽奖信息
             */
            const _arr = allMDResArray.filter(a => {
                let beFilter = false;
                const origin_description = a.origin_description;
                if (typeof origin_description === 'undefined') {
                    return beFilter;
                } else {
                    if (/[奖关转]/.test(origin_description)) {
                        beFilter = true;
                    } else {
                        return beFilter;
                    }
                }
                return beFilter;
            })
            /**
             * 提取主要内容
             */
            const arr = _arr.map(a => {
                return {
                    dynamic_id: a.dynamic_id,
                    origin_description: a.origin_description,
                    origin_hasOfficialLottery: a.origin_hasOfficialLottery,
                    origin_uid: a.origin_uid,
                    origin_uname: a.origin_uname,
                    origin_dynamic_id: a.origin_dynamic_id
                }
            })
            let elemarray = [];
            for (let one of arr) {
                let LotteryNotice = one.origin_hasOfficialLottery
                    ? await BiliAPI.getLotteryNotice(one.origin_dynamic_id)
                    : Base.getLotteryNotice(one.origin_description);
                LotteryNotice.origin_description = one.origin_description;
                LotteryNotice.dynamic_id = one.dynamic_id;/* 用于删除动态 */
                LotteryNotice.origin_uid = one.origin_uid;/* 取关 */
                LotteryNotice.origin_uname = one.origin_uname;/* 查看用户名 */
                LotteryNotice.origin_dynamic_id = one.origin_dynamic_id/* 用于查看开奖信息 */
                elemarray.push(LotteryNotice);
            }
            return elemarray;
        }
        async getNextDynamic() {
            const self = this;
            const { allModifyDynamicResArray, offset } = await self.checkAllDynamic(GlobalVar.myUID, 5, 200, this.offset);
            if (offset === '0') {
                self.offset = '-1';
            } else {
                self.offset = offset;
            }
            return allModifyDynamicResArray
        }
        /**
         * 生成一条开奖信息卡片
         * @param {InfoCard} info
         * @param {string} color
         */
        creatLotteryDetailInfo(info, color) {
            const createCompleteElement = Base.createCompleteElement
                , infocards = document.querySelector('.tab.info')
                , LotteryDetailInfo = createCompleteElement({
                    tagname: 'div',
                    attr: {
                        class: 'card',
                    },
                    children: [
                        createCompleteElement({
                            tagname: 'p',
                            attr: {
                                style: 'color:#fb7299;'
                            },
                            text: info.origin_uname + ':',
                        }),
                        createCompleteElement({
                            tagname: 'p',
                            attr: {
                                title: info.origin_description,
                                style: 'height:40px;color:gray;display:-webkit-box;overflow: hidden;-webkit-line-clamp: 2;-webkit-box-orient: vertical;'
                            },
                            text: info.origin_description
                        }),
                        createCompleteElement({
                            tagname: 'p',
                            attr: {
                                style: color
                            },
                            text: info.text
                        }),
                        createCompleteElement({
                            tagname: 'p',
                            attr: {
                                style: 'color:#ffa726;'
                            },
                            text: '奖品:' + info.item
                        }),
                        createCompleteElement({
                            tagname: 'span',
                            attr: {
                                style: 'color:green;'
                            },
                            text: info.isMe + '   '
                        }),
                        createCompleteElement({
                            tagname: 'a',
                            attr: {
                                href: 'https://t.bilibili.com/' + info.origin_dynamic_id,
                                target: '_blank'
                            },
                            text: '查看详情'
                        }),
                        createCompleteElement({
                            tagname: 'button',
                            attr: {
                                id: 'btn1',
                                'data-dyid': info.dynamic_id,
                                'data-uid': info.origin_uid
                            },
                            text: '删除动态并取关',
                        }),
                        createCompleteElement({
                            tagname: 'button',
                            attr: {
                                id: 'btn2',
                                'data-dyid': info.dynamic_id,
                            },
                            text: '仅移除动态',
                        })
                    ]
                });
            infocards.appendChild(LotteryDetailInfo);
        }
    }
    /**主入口 */
    (async function main() {
        Base.addCss('layerCss', 'code{padding:.2em .4em;margin:0;font-size:85%;background-color:rgb(27 31 35 / 5%);border-radius:6px}');
        if (!Base.checkHref(window.location.href) || !Base.checkBrowser(navigator.appVersion)) return;
        await GlobalVar.getAllMyLotteryInfo(); /* 转发信息初始化 */
        let remoteparm = await Base.getMyJson(); /* 获取热更新的默认设置 */
        let isRemoteParmError = false;
        let remoteconfig = {};
        if (remoteparm.config) {
            /** 默认设置 */
            remoteconfig = remoteparm.config;
            config = remoteconfig; /**设置初始化 */
            /**是否有最新版 */
            if (Base.checkVersion(remoteparm.version) > Base.checkVersion(Script.version)) {
                const { version, message } = remoteparm;
                Toollayer.confirm(
                    '更新提醒',
                    `最新版本为 <strong>${version}</strong><br>${message}<br>是否更新?`,
                    ['是', '否'],
                    () => { window.location.href = 'https://greasyfork.org/zh-CN/scripts/412468-bili%E5%8A%A8%E6%80%81%E6%8A%BD%E5%A5%96%E5%8A%A9%E6%89%8B' },
                    () => { Toollayer.msg('稍后更新') }
                );
            }
        } else {
            Tooltip.log('获取远程设置错误, 访问被拒绝, 稍后再来');
            isRemoteParmError = true;
        }
        /* 注册事件 BEGIN */
        let Lottery;
        eventBus.on('Show_Main_Menu', async () => {
            Tooltip.log('加载主菜单');
            let configstr = await Base.storage.get('config');
            if (configstr) {
                /**本地设置 */
                let _config = JSON.parse(configstr);
                if (Object.keys(_config).length) {
                    if (isRemoteParmError) {
                        config = _config
                    } else {
                        const config_keys = [
                            "model",
                            "chatmodel",
                            "only_followed",
                            "create_dy",
                            "dy_contents",
                            "maxday",
                            "scan_time",
                            "wait",
                            "minfollower",
                            "blockword",
                            "blacklist",
                            "whitelist",
                            "relay",
                            "chat",
                            "UIDs",
                            "TAGs"
                        ];
                        config = {
                            ...remoteconfig,
                            ..._config,
                            "blacklist": Array.from(new Set([..._config["blacklist"].split(','), ...remoteconfig["blacklist"].split(',')])).toString()
                        }
                        /**更新设置选项 */
                        const flush = remoteparm.flush;
                        if (typeof flush === "string" && flush.indexOf('1') !== -1) {
                            const flush_time = remoteparm.flush_time;
                            if (flush_time !== await Base.storage.get("flush_time")) {
                                Toollayer.confirm(
                                    '需要更新设置',
                                    `${remoteparm.flush_msg}`,
                                    ['是', '否'],
                                    () => {
                                        [...flush].forEach((isflush, i) => {
                                            const key = config_keys[i]
                                            if (isflush) _config[key] = remoteconfig[key];
                                        })
                                        eventBus.emit('Modify_settings', JSON.stringify(_config));
                                        Base.storage.set("flush_time", flush_time)
                                    },
                                    () => { Toollayer.msg('稍后更新') }
                                );
                            }
                        }
                    }
                }
            } else {
                if (isRemoteParmError) {
                    Tooltip.warn('设置初始化失败');
                    return;
                } else {
                    await Base.storage.set('config', JSON.stringify(config));
                    Tooltip.log('设置初始化成功');
                }
            }
            Lottery = [...config.UIDs, ...config.TAGs].filter(lottery => lottery !== '');
            (new MainMenu()).init();
        })
        const count = Base.counter();
        const scan_times = Base.counter();
        eventBus.on('Turn_on_the_Monitor', () => {
            if (Lottery.length === 0) { Tooltip.log('抽奖信息为空'); return }
            if (count.value() === Lottery.length) {
                const scan_time = Number(config.scan_time) / 60000; /* 分钟 */
                Toollayer.confirm(
                    `运行结束(${scan_times.next() + 1})`,
                    `结束时间 <code>${(new Date(Date.now())).toLocaleString()}</code><br>所有动态转发完毕<br>目前无抽奖信息<br>${scan_time}分钟后将再次扫描`,
                    ['是', '立即刷新'],
                    () => { Toollayer.msg('稍后再来') },
                    () => { location.reload() }
                );
                count.clear();
                Tooltip.log(`${scan_time}分钟后再次扫描`);
                setTimeout(() => {
                    eventBus.emit('Turn_on_the_Monitor');
                }, Number(config.scan_time));
                if (config.create_dy === '1') {
                    Public.prototype.checkAllDynamic(GlobalVar.myUID, 1).then(async Dynamic => {
                        if ((Dynamic.allModifyDynamicResArray[0] || { type: 1 }).type === 1) {
                            await BiliAPI.createDynamic(Base.getRandomOne(config.dy_contents));
                        }
                    })
                }
                return
            }
            const lottery = Lottery[count.next()];
            const nlottery = Number(lottery);
            (new Monitor(isNaN(nlottery) ? lottery : nlottery)).init();
        });
        eventBus.on('Modify_settings', async ({ detail }) => {
            await Base.storage.set('config', detail);
            Tooltip.log('设置修改成功');
        })
        /* 注册事件 END */
        eventBus.emit('Show_Main_Menu');
    })()
})();