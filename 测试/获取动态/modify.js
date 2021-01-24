const fs = require('fs');
function modifyDynamicRes(res) {
    const strToJson = JSON.parse,
        jsonRes = strToJson(res),
        { data } = jsonRes;
    if (jsonRes.code !== 0) {
        console.warn('获取动态数据出错,可能是访问太频繁');
        return null;
    }
    /* 字符串防止损失精度 */
    const offset = typeof data.offset === 'string' ? data.offset : /(?<=next_offset":)[0-9]*/.exec(res)[0]
        , next = {
            has_more: data.has_more,
            next_offset: offset
        };
    /**
     * 储存获取到的一组动态中的信息
     */
    let array = [];
    if (next.has_more === 0) {
        console.log('动态数据读取完毕');
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
            obj.rid_str = desc.rid_str;/* 用于发送评论 */
            obj.type = desc.type /* 动态类型 */
            obj.orig_type = desc.orig_type /* 源动态类型 */
            obj.dynamic_id = desc.dynamic_id_str; /* 转发者的动态ID !!!!此为大数需使用字符串值,不然JSON.parse()会有丢失精度 */
            const { extension } = onecard;
            obj.hasOfficialLottery = (typeof extension === 'undefined') ? false : typeof extension.lott === 'undefined' ? false : true; /* 是否有官方抽奖 */
            const item = cardToJson.item || {};
            obj.description = item.content || item.description || ''; /* 转发者的描述 */
            if (obj.type === 1) {
                obj.origin_uid = desc.origin.uid; /* 被转发者的UID */
                obj.origin_rid_str = desc.origin.rid_str /* 被转发者的rid(用于发评论) */
                obj.origin_dynamic_id = desc.orig_dy_id_str; /* 被转发者的动态的ID !!!!此为大数需使用字符串值,不然JSON.parse()会有丢失精度 */
                const { origin_extension, origin_user } = cardToJson;
                obj.origin_official_verify = typeof origin_user === 'undefined' ?
                    false : origin_user.card.official_verify.type < 0 ?
                        false : true; /* 是否官方号 */
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
fs.readFile('测试/获取动态/tagdy.json',(err,data) =>{
    if (err) {
        return;
    } else {
        const obj = modifyDynamicRes(data.toString())
        console.log(obj);
    }
})