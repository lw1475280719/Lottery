# Bili动态抽奖助手
## 目的
自动参与动态互动抽奖(关注与转发)
## 原理
监听指定的用户的转发动作  
鉴别**转发动态中**的有关抽奖的动态  
复刻转发行为
## 须知
在B站**个人主页**下启动脚本以开始  

【自动】关注中新建了分区储存待开奖UP  
【自动】移动UP至新分区  
【自动】转发动态  
【自动】等待十秒参与下一次抽奖
【自动】展示开奖信息
## 完善
在源代码中的数组`uids`中储存着所监听的用户UID
```javascript
/**
 * uid列表
 */
const uids = [
    213931643,
    15363359,
];
```
你可**自行添加**更多`UID`以复刻其转发行为  

也可将`UID`提交到[反馈](https://greasyfork.org/zh-CN/scripts/412468-bili%E5%8A%A8%E6%80%81%E6%8A%BD%E5%A5%96%E5%8A%A9%E6%89%8B/feedback)或通过[私信](https://space.bilibili.com/347692085/)通知作者进行脚本更新,参与脚本的完善
## 声明
本脚本绝对安全请放心使用(^)0(^)b  
如有任何错误请反馈，感谢使用
## 交流
QQ群:1078777380
## 如何更新
![更新方式](https://ftp.bmp.ovh/imgs/2020/10/09a1059612983cc1.png)
