/**
 * Test fixtures for juhexbot webhook messages
 * These are real message samples captured from the juhexbot API
 */
export const textMessage = {
    guid: "test-guid-123",
    notify_type: 1010,
    data: {
        from_username: "test_user",
        to_username: "filehelper",
        chatroom_sender: "",
        create_time: 1772989439,
        desc: "",
        msg_id: "2265241832514211437",
        msg_type: 1,
        is_chatroom_msg: 0,
        chatroom: "",
        source: "<msgsource>\n\t<signature>test</signature>\n</msgsource>\n",
        content: "Hello, this is a test message"
    }
};
export const imageMessage = {
    guid: "test-guid-123",
    notify_type: 1010,
    data: {
        from_username: "test_user",
        to_username: "test_receiver",
        chatroom_sender: "",
        create_time: 1772989528,
        desc: "Test User : [图片]",
        msg_id: "3039988146675050364",
        msg_type: 3,
        is_chatroom_msg: 0,
        chatroom: "",
        source: "<msgsource>\n\t<signature>test</signature>\n</msgsource>\n",
        content: "<?xml version=\"1.0\"?>\n<msg>\n\t<img aeskey=\"test\" encryver=\"1\" length=\"43945\" md5=\"test\">\n\t</img>\n</msg>\n"
    }
};
export const messageRecall = {
    guid: "test-guid-123",
    notify_type: 1010,
    data: {
        from_username: "test_user",
        to_username: "test_receiver",
        chatroom_sender: "",
        create_time: 1772989633,
        desc: "",
        msg_id: "852882791",
        msg_type: 10002,
        is_chatroom_msg: 0,
        chatroom: "",
        source: "<msgsource>\n\t<signature>test</signature>\n</msgsource>\n",
        content: "<sysmsg type=\"revokemsg\"><revokemsg><session>test_user</session><msgid>583100271</msgid><newmsgid>2024578957280591112</newmsgid><replacemsg><![CDATA[\"Test User\" 撤回了一条消息]]></replacemsg></revokemsg></sysmsg>"
    }
};
export const voiceCallMessage = {
    guid: "test-guid-123",
    notify_type: 1010,
    data: {
        from_username: "test_user",
        to_username: "filehelper",
        chatroom_sender: "",
        create_time: 1772989410,
        desc: "",
        msg_id: "1152007401934819740",
        msg_type: 51,
        is_chatroom_msg: 0,
        chatroom: "",
        source: "<msgsource>\n\t<signature>test</signature>\n</msgsource>\n",
        content: "<msg>\n<op id='5'>\n<username>filehelper</username>\n<name>lastMessage</name>\n</op>\n</msg>"
    }
};
export const appMessage = {
    guid: "test-guid-123",
    notify_type: 1010,
    data: {
        from_username: "test_chatroom@chatroom",
        to_username: "test_receiver",
        chatroom_sender: "test_sender",
        create_time: 1772989978,
        desc: "",
        msg_id: "5729008480410655547",
        msg_type: 49,
        is_chatroom_msg: 1,
        chatroom: "test_chatroom@chatroom",
        source: "<msgsource>\n\t<signature>test</signature>\n</msgsource>\n",
        content: "<?xml version=\"1.0\"?>\n<msg>\n\t<appmsg appid=\"\" sdkver=\"0\">\n\t\t<title>Test App Message</title>\n\t\t<type>51</type>\n\t</appmsg>\n</msg>\n"
    }
};
export const allMessages = [
    textMessage,
    imageMessage,
    messageRecall,
    voiceCallMessage,
    appMessage
];
