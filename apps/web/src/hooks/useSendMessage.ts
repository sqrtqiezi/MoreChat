import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, getCurrentUser } from '../api/chat';
import { addPendingMsgId } from '../utils/pendingMessages';
import type { Message } from '../types';

interface SendMessageData {
  conversationId: string;
  content: string;
  replyToMsgId?: string;
  // 用于乐观更新的引用消息信息（不发送到后端）
  replyingTo?: Message;
}

interface MessageQueryData {
  messages: Message[];
  hasMore: boolean;
  highlightedIds: string[];
}

export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: SendMessageData) => chatApi.sendMessage({
      conversationId: data.conversationId,
      content: data.content,
      replyToMsgId: data.replyToMsgId,
    }),

    onMutate: async (variables) => {
      // 取消正在进行的查询，避免覆盖乐观更新
      await queryClient.cancelQueries({ queryKey: ['messages', variables.conversationId] });

      // 获取当前用户信息
      const currentUser = await getCurrentUser();

      // 构造临时消息
      const isQuote = !!variables.replyingTo;
      const tempMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: variables.conversationId,
        senderId: currentUser.username,
        senderName: '我',
        content: variables.content,
        timestamp: new Date().toISOString(),
        status: 'sending',
        isMine: true,
        msgType: isQuote ? 49 : 1,
        displayType: isQuote ? 'quote' : 'text',
        referMsg: variables.replyingTo ? {
          type: variables.replyingTo.msgType || 1,
          senderName: variables.replyingTo.senderName,
          content: variables.replyingTo.content,
          msgId: variables.replyingTo.id,
        } : undefined,
      };

      // 乐观插入到缓存
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) {
            return { messages: [tempMessage], hasMore: false, highlightedIds: [] };
          }
          return {
            ...old,
            messages: [...old.messages, tempMessage],
          };
        }
      );

      // 返回上下文，用于回滚
      return { tempMessage };
    },

    onSuccess: (data, variables, context) => {
      if (!context) return;

      // 用真实 msgId 替换临时消息
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempMessage.id
                ? { ...data, status: 'sent' as const }
                : msg
            ),
          };
        }
      );

      // 将真实 msgId 加入 pending 集合
      addPendingMsgId(data.id);

      // 刷新会话列表
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },

    onError: (_error, variables, context) => {
      if (!context) return;

      // 标记消息为失败
      queryClient.setQueryData<MessageQueryData>(
        ['messages', variables.conversationId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            messages: old.messages.map((msg) =>
              msg.id === context.tempMessage.id
                ? { ...msg, status: 'failed' as const }
                : msg
            ),
          };
        }
      );
    },
  });
}
