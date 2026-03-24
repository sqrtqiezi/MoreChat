// ABOUTME: Renders text with WeChat built-in emoji codes ([微笑] [捂脸] etc.) replaced by actual emoji images
// ABOUTME: Uses official WeChat CDN image URLs for pixel-perfect rendering

import { WECHAT_EMOJI_MAP } from '../lib/wechatEmoji';

const EMOJI_REGEX = /\[([^\[\]]+)\]/g;

interface WechatEmojiTextProps {
  text: string;
}

export function WechatEmojiText({ text }: WechatEmojiTextProps) {
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = EMOJI_REGEX.exec(text)) !== null) {
    const emojiName = match[1];
    const url = WECHAT_EMOJI_MAP[emojiName];

    if (url) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      parts.push(
        <img
          key={match.index}
          src={url}
          alt={`[${emojiName}]`}
          title={`[${emojiName}]`}
          className="inline-block align-text-bottom"
          style={{ width: '1.2em', height: '1.2em' }}
        />
      );
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 0) {
    return <>{text}</>;
  }

  return <>{parts}</>;
}
