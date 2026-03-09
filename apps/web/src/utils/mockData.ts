import { Conversation } from '../types';

export const mockConversations: Conversation[] = [
  {
    id: '1',
    name: '张伟',
    type: 'private',
    lastMessage: '好的，明天见！',
    unreadCount: 2,
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  },
  {
    id: '2',
    name: '产品团队',
    type: 'group',
    lastMessage: '李娜: 新版本的设计稿已经上传了',
    unreadCount: 15,
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
  },
  {
    id: '3',
    name: '王芳',
    type: 'private',
    lastMessage: '收到，谢谢！',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: '4',
    name: '技术讨论组',
    type: 'group',
    lastMessage: '赵强: 这个问题我来看看',
    unreadCount: 5,
    updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
  },
  {
    id: '5',
    name: '刘洋',
    type: 'private',
    lastMessage: '周末一起打球吗？',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: '6',
    name: '陈静',
    type: 'private',
    lastMessage: '文档我已经发给你了',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
  },
  {
    id: '7',
    name: '运营小组',
    type: 'group',
    lastMessage: '孙敏: 下周的活动方案需要大家确认',
    unreadCount: 120,
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
  {
    id: '8',
    name: '周杰',
    type: 'private',
    lastMessage: '好的，我知道了',
    unreadCount: 0,
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
  },
];
