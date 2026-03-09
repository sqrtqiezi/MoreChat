📊 Analyzing 13 message samples...

📋 Message Types Found:
────────────────────────────────────────────────────────────
Type 51 (Voice/Video Call): 5 samples
  Files: msg-1772989411427-2.json, msg-1772989411428-2.json, msg-1772989440443-3.json, msg-1772990034277-11.json, msg-1772990042400-12.json
Type 1 (Text): 5 samples
  Files: msg-1772989440620-4.json, msg-1772989523088-5.json, msg-1772989633986-7.json, msg-1772989985456-10.json, msg-1772990136047-13.json
Type 3 (Image): 1 samples
  Files: msg-1772989531726-6.json
Type 10002 (Message Recall): 1 samples
  Files: msg-1772989634452-8.json
Type 49 (App/Link/File): 1 samples
  Files: msg-1772989982603-9.json
────────────────────────────────────────────────────────────

📝 Common Fields:
data, guid, notify_type

📄 Sample Data by Type:


### Type 51 - Voice/Video Call
```json
{
  "guid": "7092457f-325f-3b3a-bf8e-a30b4dcaf74b",
  "notify_type": 1010,
  "data": {
    "from_username": "njin_cool",
    "to_username": "filehelper",
    "chatroom_sender": "",
    "create_time": 1772989410,
    "desc": "",
    "msg_id": "1152007401934819740",
    "msg_type": 51,
    "is_chatroom_msg": 0,
    "chatroom": "",
    "source": "<msgsource>\n\t<signature>v1_Tnpr/xZl</signature>\n\t<tmp_node>\n\t\t<publisher-id></publisher-id>\n\t</tmp_node>\n</msgsource>\n",
    "content": "<msg>\n<op id='5'>\n<username>filehelper</username>\n<name>lastMessage</name>\n<arg>{\"messageSvrId\":\"7916418842473060361\",\"MsgCreateTime\":\"1772935725679\"}</arg>\n</op>\n</msg>"
  }
}
```

### Type 1 - Text
```json
{
  "guid": "7092457f-325f-3b3a-bf8e-a30b4dcaf74b",
  "notify_type": 1010,
  "data": {
    "from_username": "njin_cool",
    "to_username": "filehelper",
    "chatroom_sender": "",
    "create_time": 1772989439,
    "desc": "",
    "msg_id": "2265241832514211437",
    "msg_type": 1,
    "is_chatroom_msg": 0,
    "chatroom": "",
    "source": "<msgsource>\n\t<pua>1</pua>\n\t<eggIncluded>1</eggIncluded>\n\t<signature>N0_V1_9/dbMQa/|v1_9jE9m+eJ</signature>\n\t<tmp_node>\n\t\t<publisher-id></publisher-id>\n\t</tmp_node>\n</msgsource>\n",
    "content": "111"
  }
}
```

### Type 3 - Image
```json
{
  "guid": "7092457f-325f-3b3a-bf8e-a30b4dcaf74b",
  "notify_type": 1010,
  "data": {
    "from_username": "wxid_abw19y0lhwkt12",
    "to_username": "njin_cool",
    "chatroom_sender": "",
    "create_time": 1772989528,
    "desc": "Super Mario : [图片]",
    "msg_id": "3039988146675050364",
    "msg_type": 3,
    "is_chatroom_msg": 0,
    "chatroom": "",
    "source": "<msgsource>\n\t<alnode>\n\t\t<fr>2</fr>\n\t</alnode>\n\t<tmp_node>\n\t\t<publisher-id></publisher-id>\n\t</tmp_node>\n\t<sec_msg_node>\n\t\t<uuid>82563798c09295e64eb036d173381602_</uuid>\n\t\t<risk-file-flag />\n\t\t<risk-file-md5-list />\n\t</sec_msg_node>\n\t<imgmsg_pd cdnmidimgurl_size=\"43945\" cdnmidimgurl_pd_pri=\"30\" cdnmidimgurl_pd=\"0\" />\n\t<signature>N0_V1_qjL7/PHt|v1_eV4L2lJU</signature>\n</msgsource>\n",
    "content": "<?xml version=\"1.0\"?>\n<msg>\n\t<img aeskey=\"08d6100270d87273f666e2bb6ebd8f63\" encryver=\"1\" cdnthumbaeskey=\"08d6100270d87273f666e2bb6ebd8f63\" cdnthumburl=\"3057020100044b3049020100020476b8ff8702032f565d02041e41aa3d020469abc540042466323338656338392d336565662d343061362d383765612d343534333533633237623661020401152a010201000405004c4d9900\" cdnthumblength=\"2640\" cdnthumbheight=\"108\" cdnthumbwidth=\"180\" cdnmidheight=\"0\" cdnmidwidth=\"0\" cdnhdheight=\"0\" cdnhdwidth=\"0\" cdnmidimgurl=\"3057020100044b3049020100020476b8ff8702032f565d02041e41aa3d020469abc540042466323338656338392d336565662d343061362d383765612d343534333533633237623661020401152a010201000405004c4d9900\" length=\"43945\" md5=\"a53daf1ac1dcec405ef63a1958bbed2f\" hevc_mid_size=\"43945\">\n\t\t<secHashInfoBase64>eyJwaGFzaCI6IjEwMDAwMDAwMDAwMDAwMDAiLCJwZHFIYXNoIjoiOGZjNzhmODcwZjgzNGY4M2Y3\nYmI3ODc5ZjAzZmYwM2I2MDdiMDNiZDA3ODEwN2MzOGI4MTg2ODJmYzQwZjg1MCJ9\n</secHashInfoBase64>\n\t\t<live>\n\t\t\t<duration>0</duration>\n\t\t\t<size>0</size>\n\t\t\t<md5 />\n\t\t\t<fileid />\n\t\t\t<hdsize>0</hdsize>\n\t\t\t<hdmd5 />\n\t\t\t<hdfileid />\n\t\t\t<stillimagetimems>0</stillimagetimems>\n\t\t</live>\n\t</img>\n\t<platform_signature />\n\t<imgdatahash />\n\t<ImgSourceInfo>\n\t\t<ImgSourceUrl />\n\t\t<BizType>0</BizType>\n\t</ImgSourceInfo>\n</msg>\n"
  }
}
```

### Type 10002 - Message Recall
```json
{
  "guid": "7092457f-325f-3b3a-bf8e-a30b4dcaf74b",
  "notify_type": 1010,
  "data": {
    "from_username": "wxid_abw19y0lhwkt12",
    "to_username": "njin_cool",
    "chatroom_sender": "",
    "create_time": 1772989633,
    "desc": "",
    "msg_id": "852882791",
    "msg_type": 10002,
    "is_chatroom_msg": 0,
    "chatroom": "",
    "source": "<msgsource>\n\t<tmp_node>\n\t\t<publisher-id></publisher-id>\n\t</tmp_node>\n</msgsource>\n",
    "content": "<sysmsg type=\"revokemsg\"><revokemsg><session>wxid_abw19y0lhwkt12</session><msgid>583100271</msgid><newmsgid>2024578957280591112</newmsgid><replacemsg><![CDATA[\"Super Mario\" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>"
  }
}
```

### Type 49 - App/Link/File
```json
{
  "guid": "7092457f-325f-3b3a-bf8e-a30b4dcaf74b",
  "notify_type": 1010,
  "data": {
    "from_username": "49599342989@chatroom",
    "to_username": "njin_cool",
    "chatroom_sender": "wxid_f270ma4san5q22",
    "create_time": 1772989978,
    "desc": "",
    "msg_id": "5729008480410655547",
    "msg_type": 49,
    "is_chatroom_msg": 1,
    "chatroom": "49599342989@chatroom",
    "source": "<msgsource>\n\t<alnode>\n\t\t<fr>2</fr>\n\t</alnode>\n\t<sec_msg_node>\n\t\t<uuid>35331d7aba033549a6980f30bc35ae49_</uuid>\n\t\t<risk-file-flag />\n\t\t<risk-file-md5-list />\n\t</sec_msg_node>\n\t<silence>1</silence>\n\t<membercount>482</membercount>\n\t<signature>N0_V1_QSSUMwLp|v1_ecMON+IY</signature>\n\t<tmp_node>\n\t\t<publisher-id></publisher-id>\n\t</tmp_node>\n</msgsource>\n",
    "content": "<?xml version=\"1.0\"?>\n<msg>\n\t<appmsg appid=\"\" sdkver=\"0\">\n\t\t<title>当前版本不支持展示该内容，请升级至最新版本。</title>\n\t\t<des />\n\t\t<username />\n\t\t<action>view</action>\n\t\t<type>51</type>\n\t\t<showtype>0</showtype>\n\t\t<content />\n\t\t<url>https://support.weixin.qq.com/security/readtemplate?t=w_security_center_website/upgrade</url>\n\t\t<lowurl />\n\t\t<forwardflag>0</forwardflag>\n\t\t<dataurl />\n\t\t<lowdataurl />\n\t\t<contentattr>0</contentattr>\n\t\t<streamvideo>\n\t\t\t<streamvideourl />\n\t\t\t<streamvideototaltime>0</streamvideototaltime>\n\t\t\t<streamvideotitle />\n\t\t\t<streamvideowording />\n\t\t\t<streamvideoweburl />\n\t\t\t<streamvideothumburl />\n\t\t\t<streamvideoaduxinfo />\n\t\t\t<streamvideopublishid />\n\t\t</streamvideo>\n\t\t<canvasPageItem>\n\t\t\t<canvasPageXml><![CDATA[]]></canvasPageXml>\n\t\t</canvasPageItem>\n\t\t<appattach>\n\t\t\t<totallen>0</totallen>\n\t\t\t<attachid />\n\t\t\t<cdnattachurl />\n\t\t\t<emoticonmd5></emoticonmd5>\n\t\t\t<aeskey></aeskey>\n\t\t\t<fileext />\n\t\t\t<islargefilemsg>0</islargefilemsg>\n\t\t</appattach>\n\t\t<extinfo />\n\t\t<androidsource>0</androidsource>\n\t\t<thumburl />\n\t\t<mediatagname />\n\t\t<messageaction><![CDATA[]]></messageaction>\n\t\t<messageext><![CDATA[]]></messageext>\n\t\t<emoticongift>\n\t\t\t<packageflag>0</packageflag>\n\t\t\t<packageid />\n\t\t</emoticongift>\n\t\t<emoticonshared>\n\t\t\t<packageflag>0</packageflag>\n\t\t\t<packageid />\n\t\t</emoticonshared>\n\t\t<designershared>\n\t\t\t<designeruin>0</designeruin>\n\t\t\t<designername>null</designername>\n\t\t\t<designerrediretcturl><![CDATA[null]]></designerrediretcturl>\n\t\t</designershared>\n\t\t<emotionpageshared>\n\t\t\t<tid>0</tid>\n\t\t\t<title>null</title>\n\t\t\t<desc>null</desc>\n\t\t\t<iconUrl><![CDATA[null]]></iconUrl>\n\t\t\t<secondUrl>null</secondUrl>\n\t\t\t<pageType>0</pageType>\n\t\t\t<setKey>null</setKey>\n\t\t</emotionpageshared>\n\t\t<webviewshared>\n\t\t\t<shareUrlOriginal />\n\t\t\t<shareUrlOpen />\n\t\t\t<jsAppId />\n\t\t\t<publisherId />\n\t\t\t<publisherReqId />\n\t\t</webviewshared>\n\t\t<template_id />\n\t\t<md5 />\n\t\t<websearch>\n\t\t\t<rec_category>0</rec_category>\n\t\t\t<channelId>0</channelId>\n\t\t</websearch>\n\t\t<weappinfo>\n\t\t\t<username />\n\t\t\t<appid />\n\t\t\t<appservicetype>0</appservicetype>\n\t\t\t<secflagforsinglepagemode>0</secflagforsinglepagemode>\n\t\t\t<videopageinfo>\n\t\t\t\t<thumbwidth>0</thumbwidth>\n\t\t\t\t<thumbheight>0</thumbheight>\n\t\t\t\t<fromopensdk>0</fromopensdk>\n\t\t\t</videopageinfo>\n\t\t</weappinfo>\n\t\t<statextstr />\n\t\t<musicShareItem>\n\t\t\t<musicDuration>0</musicDuration>\n\t\t</musicShareItem>\n\t\t<finderFeed>\n\t\t\t<objectId>14872873154989070622</objectId>\n\t\t\t<objectNonceId>9285000045731959015_4_20_13_1_1772989242386686_5758caf8-1b10-11f1-8143-dbf14539ff46</objectNonceId>\n\t\t\t<feedType>4</feedType>\n\t\t\t<nickname>是小冰心啊</nickname>\n\t\t\t<username>v2_060000231003b20faec8cae3881dc1dcca07ed34b0772142c6647606485936da239002e874eb@finder</username>\n\t\t\t<avatar><![CDATA[https://wx.qlogo.cn/finderhead/ver_1/4z4LEr41DQLRCtTJQicTxqFIic8Z1f8KXS5YwlhvJpMC6cQX0fBuyTx0XHfGAuZVJSA6k315lCw2iaApokmpibKiavdusEH26wCnhnWJOFQJoibcibn0Dg9Y3uHW6UMjsl8AzXe/0]]></avatar>\n\t\t\t<desc>我给男法官买了10条小裙子\n#小冰心 #抽象 #搞笑 #日常 #律师\n</desc>\n\t\t\t<mediaCount>1</mediaCount>\n\t\t\t<localId>0</localId>\n\t\t\t<authIconType>1</authIconType>\n\t\t\t<authIconUrl><![CDATA[https://dldir1v6.qq.com/weixin/checkresupdate/auth_icon_level3_2e2f94615c1e4651a25a7e0446f63135.png]]></authIconUrl>\n\t\t\t<mediaList>\n\t\t\t\t<media>\n\t\t\t\t\t<mediaType>4</mediaType>\n\t\t\t\t\t<url><![CDATA[http://wxapp.tc.qq.com/251/20302/stodownload?encfilekey=Cvvj5Ix3eewK0tHtibORqcsqchXNh0Gf3sJcaYqC2rQA3LibHQ4696UF9AChUnW0DY00psEMwPMDhdynjVbz05F93ibCMMibcyOs6pxZ8EZ6J68W7UBPVZ0pZZxV4k2e4hZW&bizid=1023&dotrans=0&hy=SH&idx=1&m=&uzid=7a15c&token=ic1n0xDG6aw8IMhGaQDjgiaThdsiaHvQUXxnWrGGhsnV7NWib2od8ujyOnwoHXPnPwBos6hevEysZiaCL2OsGXhMFBTmzGtnP7icJhhhjNT0lKSoo98AOmK3icNHF0PRvm8uCQ00DnYdVKu1BEzb5OhPjWolQyF7ACkgNYiaMfPEqOUd7eGV0Hqk8ACwBpgDZSNytGunH4VBjAxaT8voicHo3eo2zcvY6L7Z5kzFAmMFhueW9fibQ&basedata=CAESBnhXVDE1NiJaCgoKBnhXVDE1NhAACgoKBnhXVDE1OBAACgoKBnhXVDE1NxABCgoKBnhXVDExMxAACgoKBnhXVDExMhABCgoKBnhXVDExMRAACgcKA3hBMBAACgcKA3hBMhAA&sign=4s8K_h02_tagZKx3V9RsTgAzOhbYcF_Rj3lh2fTfHb1Vn2oIZbWe_xcFSuWmcJQosKOxtCjQ3bB4GGuUN6Eadg&extg=88c500&svrbypass=AAuL%2FQsFAAABAAAAAAB9BDh0nf07FvRCPKutaRAAAADnaHZTnGbFfAj9RgZXfw6VFkkX76Iv4pyt%2Fsc0L%2FWAMgKPFVL4jmEYZpoDoWuIvSM%2BkRQclOPutFU%3D&svrnonce=1772989244]]></url>\n\t\t\t\t\t<thumbUrl><![CDATA[https://wxapp.tc.qq.com/251/20304/stodownload?encfilekey=rjD5jyTuFrIpZ2ibE8T7YmwgiahniaXswqzaIUhoUPPeTybAkBdmbpTesmicbR8BT0qZfth1xts9icKykp7tCKicEhHDZJQTrfaTwNnCuWyMicC3BYL2kJibpibppIw&hy=SH&idx=1&m=&scene=2&uzid=1&picformat=200&wxampicformat=503&token=AxricY7RBHdV8cpa0NgPSwvlb2KxR5iaSHHqllkXxPd0vVMdoibicR3ibrTqwlaLic7LKfyZ4uA8ZqTY8es9QoaaTSXm1AyNTM6uwvMtV4ootqQlxaxBh8LwcQpibscOCCoWVmAEP4O0PEqGeSbHn61ayg8IrQC1QdDzdODzKJOgsSUVPK3pYdYyibwGWMCOrqHo7vonwdfmzMl8uPpichQ8H99RtFdqhBYG1pP4u]]></thumbUrl>\n\t\t\t\t\t<coverUrl><![CDATA[https://wxapp.tc.qq.com/251/20304/stodownload?encfilekey=rjD5jyTuFrIpZ2ibE8T7YmwgiahniaXswqzaIUhoUPPeTybAkBdmbpTesmicbR8BT0qZfth1xts9icKykp7tCKicEhHDZJQTrfaTwNnCuWyMicC3BYL2kJibpibppIw&hy=SH&idx=1&m=&scene=2&uzid=1&picformat=200&wxampicformat=503&token=AxricY7RBHdV8cpa0NgPSwvlb2KxR5iaSHHqllkXxPd0vVMdoibicR3ibrTqwlaLic7LKfyZ4uA8ZqTY8es9QoaaTSXm1AyNTM6uwvMtV4ootqQlxaxBh8LwcQpibscOCCoWVmAEP4O0PEqGeSbHn61ayg8IrQC1QdDzdODzKJOgsSUVPK3pYdYyibwGWMCOrqHo7vonwdfmzMl8uPpichQ8H99RtFdqhBYG1pP4u]]></coverUrl>\n\t\t\t\t\t<fullCoverUrl><![CDATA[]]></fullCoverUrl>\n\t\t\t\t\t<fullClipInset><![CDATA[]]></fullClipInset>\n\t\t\t\t\t<width>1080.0</width>\n\t\t\t\t\t<height>1920.0</height>\n\t\t\t\t\t<videoPlayDuration>115</videoPlayDuration>\n\t\t\t\t</media>\n\t\t\t</mediaList>\n\t\t\t<megaVideo>\n\t\t\t\t<objectId />\n\t\t\t\t<objectNonceId />\n\t\t\t</megaVideo>\n\t\t\t<bizUsername />\n\t\t\t<bizNickname />\n\t\t\t<bizAvatar><![CDATA[]]></bizAvatar>\n\t\t\t<bizUsernameV2 />\n\t\t\t<bizAuthIconType>0</bizAuthIconType>\n\t\t\t<bizAuthIconUrl><![CDATA[]]></bizAuthIconUrl>\n\t\t\t<coverEffectType>0</coverEffectType>\n\t\t\t<coverEffectText><![CDATA[]]></coverEffectText>\n\t\t\t<finderForwardSource><![CDATA[]]></finderForwardSource>\n\t\t\t<contactJumpInfoStr><![CDATA[]]></contactJumpInfoStr>\n\t\t\t<ecSource><![CDATA[]]></ecSource>\n\t\t\t<sourceCommentScene>20</sourceCommentScene>\n\t\t\t<finderShareExtInfo><![CDATA[{\"hasInput\":true,\"tabContextId\":\"4-1772989831046\",\"contextId\":\"1-1-20-b506139203e54548a2ee92e149790ba5\",\"shareSrcScene\":4}]]></finderShareExtInfo>\n\t\t</finderFeed>\n\t\t<finderLiveProductShare>\n\t\t\t<finderLiveID><![CDATA[]]></finderLiveID>\n\t\t\t<finderUsername><![CDATA[]]></finderUsername>\n\t\t\t<finderObjectID><![CDATA[]]></finderObjectID>\n\t\t\t<finderNonceID><![CDATA[]]></finderNonceID>\n\t\t\t<liveStatus><![CDATA[]]></liveStatus>\n\t\t\t<appId><![CDATA[]]></appId>\n\t\t\t<pagePath><![CDATA[]]></pagePath>\n\t\t\t<productId><![CDATA[]]></productId>\n\t\t\t<coverUrl><![CDATA[]]></coverUrl>\n\t\t\t<productTitle><![CDATA[]]></productTitle>\n\t\t\t<marketPrice><![CDATA[0]]></marketPrice>\n\t\t\t<sellingPrice><![CDATA[0]]></sellingPrice>\n\t\t\t<platformHeadImg><![CDATA[]]></platformHeadImg>\n\t\t\t<platformName><![CDATA[]]></platformName>\n\t\t\t<shopWindowId><![CDATA[]]></shopWindowId>\n\t\t\t<flashSalePrice><![CDATA[0]]></flashSalePrice>\n\t\t\t<flashSaleEndTime><![CDATA[0]]></flashSaleEndTime>\n\t\t\t<ecSource><![CDATA[]]></ecSource>\n\t\t\t<sellingPriceWording><![CDATA[]]></sellingPriceWording>\n\t\t\t<platformIconURL><![CDATA[]]></platformIconURL>\n\t\t\t<firstProductTagURL><![CDATA[]]></firstProductTagURL>\n\t\t\t<firstProductTagAspectRatioString><![CDATA[0.0]]></firstProductTagAspectRatioString>\n\t\t\t<secondProductTagURL><![CDATA[]]></secondProductTagURL>\n\t\t\t<secondProductTagAspectRatioString><![CDATA[0.0]]></secondProductTagAspectRatioString>\n\t\t\t<firstGuaranteeWording><![CDATA[]]></firstGuaranteeWording>\n\t\t\t<secondGuaranteeWording><![CDATA[]]></secondGuaranteeWording>\n\t\t\t<thirdGuaranteeWording><![CDATA[]]></thirdGuaranteeWording>\n\t\t\t<isPriceBeginShow>false</isPriceBeginShow>\n\t\t\t<lastGMsgID><![CDATA[]]></lastGMsgID>\n\t\t\t<promoterKey><![CDATA[]]></promoterKey>\n\t\t\t<discountWording><![CDATA[]]></discountWording>\n\t\t\t<priceSuffixDescription><![CDATA[]]></priceSuffixDescription>\n\t\t\t<productCardKey><![CDATA[]]></productCardKey>\n\t\t\t<isWxShop><![CDATA[]]></isWxShop>\n\t\t\t<brandIconUrl><![CDATA[]]></brandIconUrl>\n\t\t\t<rIconUrl><![CDATA[]]></rIconUrl>\n\t\t\t<rIconUrlDarkMode><![CDATA[]]></rIconUrlDarkMode>\n\t\t\t<topShopIconUrl><![CDATA[]]></topShopIconUrl>\n\t\t\t<topShopIconUrlDarkMode><![CDATA[]]></topShopIconUrlDarkMode>\n\t\t\t<simplifyTopShopIconUrl><![CDATA[]]></simplifyTopShopIconUrl>\n\t\t\t<simplifyTopShopIconUrlDarkmode><![CDATA[]]></simplifyTopShopIconUrlDarkmode>\n\t\t\t<topShopIconWidth><![CDATA[0]]></topShopIconWidth>\n\t\t\t<topShopIconHeight><![CDATA[0]]></topShopIconHeight>\n\t\t\t<simplifyTopShopIconWidth><![CDATA[0]]></simplifyTopShopIconWidth>\n\t\t\t<simplifyTopShopIconHeight><![CDATA[0]]></simplifyTopShopIconHeight>\n\t\t\t<maskPriceWording><![CDATA[]]></maskPriceWording>\n\t\t\t<showBoxItemStringList />\n\t\t\t<richLabelTitleB64><![CDATA[]]></richLabelTitleB64>\n\t\t\t<richShopDescB64><![CDATA[]]></richShopDescB64>\n\t\t</finderLiveProductShare>\n\t\t<finderOrder>\n\t\t\t<appID><![CDATA[]]></appID>\n\t\t\t<orderID><![CDATA[]]></orderID>\n\t\t\t<path><![CDATA[]]></path>\n\t\t\t<priceWording><![CDATA[]]></priceWording>\n\t\t\t<stateWording><![CDATA[]]></stateWording>\n\t\t\t<productImageURL><![CDATA[]]></productImageURL>\n\t\t\t<products><![CDATA[]]></products>\n\t\t\t<productsCount><![CDATA[0]]></productsCount>\n\t\t\t<orderType><![CDATA[0]]></orderType>\n\t\t\t<newPriceWording><![CDATA[]]></newPriceWording>\n\t\t\t<newStateWording><![CDATA[]]></newStateWording>\n\t\t\t<useNewWording><![CDATA[0]]></useNewWording>\n\t\t</finderOrder>\n\t\t<finderShopWindowShare>\n\t\t\t<finderUsername><![CDATA[]]></finderUsername>\n\t\t\t<avatar><![CDATA[]]></avatar>\n\t\t\t<nickname><![CDATA[]]></nickname>\n\t\t\t<commodityInStockCount><![CDATA[]]></commodityInStockCount>\n\t\t\t<appId><![CDATA[]]></appId>\n\t\t\t<path><![CDATA[]]></path>\n\t\t\t<appUsername><![CDATA[]]></appUsername>\n\t\t\t<query><![CDATA[]]></query>\n\t\t\t<liteAppId><![CDATA[]]></liteAppId>\n\t\t\t<liteAppPath><![CDATA[]]></liteAppPath>\n\t\t\t<liteAppQuery><![CDATA[]]></liteAppQuery>\n\t\t\t<platformTagURL><![CDATA[]]></platformTagURL>\n\t\t\t<saleWording><![CDATA[]]></saleWording>\n\t\t\t<lastGMsgID><![CDATA[]]></lastGMsgID>\n\t\t\t<profileTypeWording><![CDATA[]]></profileTypeWording>\n\t\t\t<saleWordingExtra><![CDATA[]]></saleWordingExtra>\n\t\t\t<isWxShop><![CDATA[]]></isWxShop>\n\t\t\t<platformIconUrl><![CDATA[]]></platformIconUrl>\n\t\t\t<brandIconUrl><![CDATA[]]></brandIconUrl>\n\t\t\t<description><![CDATA[]]></description>\n\t\t\t<backgroundUrl><![CDATA[]]></backgroundUrl>\n\t\t\t<darkModePlatformIconUrl><![CDATA[]]></darkModePlatformIconUrl>\n\t\t\t<rIconUrl><![CDATA[]]></rIconUrl>\n\t\t\t<rIconUrlDarkMode><![CDATA[]]></rIconUrlDarkMode>\n\t\t\t<rWords><![CDATA[]]></rWords>\n\t\t\t<topShopIconUrl><![CDATA[]]></topShopIconUrl>\n\t\t\t<topShopIconUrlDarkMode><![CDATA[]]></topShopIconUrlDarkMode>\n\t\t\t<simplifyTopShopIconUrl><![CDATA[]]></simplifyTopShopIconUrl>\n\t\t\t<simplifyTopShopIconUrlDarkmode><![CDATA[]]></simplifyTopShopIconUrlDarkmode>\n\t\t\t<topShopIconWidth><![CDATA[0]]></topShopIconWidth>\n\t\t\t<topShopIconHeight><![CDATA[0]]></topShopIconHeight>\n\t\t\t<simplifyTopShopIconWidth><![CDATA[0]]></simplifyTopShopIconWidth>\n\t\t\t<simplifyTopShopIconHeight><![CDATA[0]]></simplifyTopShopIconHeight>\n\t\t\t<reputationInfo>\n\t\t\t\t<hasReputationInfo>0</hasReputationInfo>\n\t\t\t\t<reputationScore>0</reputationScore>\n\t\t\t\t<reputationWording />\n\t\t\t\t<reputationTextColor />\n\t\t\t\t<reputationLevelWording />\n\t\t\t\t<reputationBackgroundColor />\n\t\t\t</reputationInfo>\n\t\t\t<productImageURLList />\n\t\t</finderShopWindowShare>\n\t\t<findernamecard>\n\t\t\t<username />\n\t\t\t<avatar><![CDATA[]]></avatar>\n\t\t\t<nickname />\n\t\t\t<auth_job />\n\t\t\t<auth_icon>0</auth_icon>\n\t\t\t<auth_icon_url />\n\t\t\t<ecSource><![CDATA[]]></ecSource>\n\t\t\t<lastGMsgID><![CDATA[]]></lastGMsgID>\n\t\t</findernamecard>\n\t\t<finderGuarantee>\n\t\t\t<scene><![CDATA[0]]></scene>\n\t\t</finderGuarantee>\n\t\t<directshare>0</directshare>\n\t\t<gamecenter>\n\t\t\t<namecard>\n\t\t\t\t<iconUrl />\n\t\t\t\t<name />\n\t\t\t\t<desc />\n\t\t\t\t<tail />\n\t\t\t\t<jumpUrl />\n\t\t\t\t<liteappId />\n\t\t\t\t<liteappPath />\n\t\t\t\t<liteappQuery />\n\t\t\t\t<liteappMinVersion />\n\t\t\t</namecard>\n\t\t</gamecenter>\n\t\t<patMsg>\n\t\t\t<chatUser />\n\t\t\t<records>\n\t\t\t\t<recordNum>0</recordNum>\n\t\t\t</records>\n\t\t</patMsg>\n\t\t<secretmsg>\n\t\t\t<issecretmsg>0</issecretmsg>\n\t\t</secretmsg>\n\t\t<referfromscene>0</referfromscene>\n\t\t<gameshare>\n\t\t\t<liteappext>\n\t\t\t\t<liteappbizdata />\n\t\t\t\t<priority>0</priority>\n\t\t\t</liteappext>\n\t\t\t<appbrandext>\n\t\t\t\t<litegameinfo />\n\t\t\t\t<priority>-1</priority>\n\t\t\t</appbrandext>\n\t\t\t<gameshareid />\n\t\t\t<sharedata />\n\t\t\t<isvideo>0</isvideo>\n\t\t\t<duration>-1</duration>\n\t\t\t<isexposed>0</isexposed>\n\t\t\t<readtext />\n\t\t</gameshare>\n\t\t<tingChatRoomItem>\n\t\t\t<type>0</type>\n\t\t\t<categoryItem>null</categoryItem>\n\t\t\t<categoryId />\n\t\t\t<listenItem>null</listenItem>\n\t\t</tingChatRoomItem>\n\t\t<photoaccountnamecard>\n\t\t\t<username />\n\t\t\t<nickname />\n\t\t\t<fromnickname />\n\t\t\t<fullpy />\n\t\t\t<shortpy />\n\t\t\t<alias />\n\t\t\t<imagestatus>0</imagestatus>\n\t\t\t<scene>0</scene>\n\t\t\t<province />\n\t\t\t<city />\n\t\t\t<sign />\n\t\t\t<percard>0</percard>\n\t\t\t<sex>0</sex>\n\t\t\t<certflag>0</certflag>\n\t\t\t<certinfo />\n\t\t\t<certinfoext />\n\t\t\t<brandIconUrl><![CDATA[]]></brandIconUrl>\n\t\t\t<brandHomeUrl><![CDATA[]]></brandHomeUrl>\n\t\t\t<brandSubscriptConfigUrl><![CDATA[]]></brandSubscriptConfigUrl>\n\t\t\t<brandFlags>0</brandFlags>\n\t\t\t<regionCode />\n\t\t\t<biznamecardinfo><![CDATA[]]></biznamecardinfo>\n\t\t\t<brandType>0</brandType>\n\t\t</photoaccountnamecard>\n\t\t<mpsharetrace>\n\t\t\t<hasfinderelement>0</hasfinderelement>\n\t\t\t<lastgmsgid />\n\t\t</mpsharetrace>\n\t\t<wxgamecard>\n\t\t\t<framesetname />\n\t\t\t<mbcarddata />\n\t\t\t<minpkgversion />\n\t\t\t<clientextinfo />\n\t\t\t<mbcardheight>0</mbcardheight>\n\t\t\t<isoldversion>0</isoldversion>\n\t\t</wxgamecard>\n\t\t<ecskfcard>\n\t\t\t<framesetname />\n\t\t\t<mbcarddata />\n\t\t\t<minupdateunixtimestamp>0</minupdateunixtimestamp>\n\t\t\t<needheader>false</needheader>\n\t\t\t<summary />\n\t\t</ecskfcard>\n\t\t<liteapp>\n\t\t\t<id>null</id>\n\t\t\t<path />\n\t\t\t<query />\n\t\t\t<istransparent>0</istransparent>\n\t\t\t<hideicon>0</hideicon>\n\t\t\t<forbidforward>0</forbidforward>\n\t\t</liteapp>\n\t\t<opensdk_share_is_modified>0</opensdk_share_is_modified>\n\t</appmsg>\n\t<fromusername>wxid_f270ma4san5q22</fromusername>\n\t<scene>0</scene>\n\t<appinfo>\n\t\t<version>1</version>\n\t\t<appname />\n\t</appinfo>\n\t<commenturl />\n</msg>\n"
  }
}
```
