/*!
 * Copyright 2024 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  ChatModel,
  ChatStore,
  GroupMetadataStore,
  LabelStore,
  MsgKey,
  NewsletterStore,
  Wid,
} from '../../whatsapp';
import { get } from './get';

export interface ChatListOptions {
  id?: Wid;
  count?: number;
  direction?: 'after' | 'before';
  onlyCommunities?: boolean;
  onlyGroups?: boolean;
  onlyNewsletter?: boolean;
  onlyUsers?: boolean;
  onlyWithUnreadMessage?: boolean;
  onlyArchived?: boolean;
  withLabels?: string[];
  ignoreGroupMetadata?: boolean;
  groupMetadataTimeout?: number;
  waitForSync?: boolean;
  syncTimeoutMs?: number;
}

/**
 * Return a list of chats.
 *
 * By default, this function waits up to 5 seconds for the background history sync chunks to be processed
 * to ensure chats are loaded. Set `waitForSync: false` to list immediately with currently cached data.
 *
 * @example
 * ```javascript
 * // All chats (waits up to 5 seconds by default)
 * const chats = await WPP.chat.list();
 *
 * // List immediately without waiting for sync
 * const chats = await WPP.chat.list({ waitForSync: false });
 *
 * // Wait for sync with a custom timeout of 30 seconds
 * const chats = await WPP.chat.list({ waitForSync: true, syncTimeoutMs: 30000 });
 *
 * // Some chats
 * const chats = WPP.chat.list({count: 20});
 *
 * // 20 chats before specific chat
 * const chats = WPP.chat.list({count: 20, direction: 'before', id: '[number]@c.us'});
 *
 * // Only users chats
 * const chats = await WPP.chat.list({onlyUsers: true});
 *
 * // Only groups chats
 * const chats = await WPP.chat.list({onlyGroups: true});
 *
 * // Only communities chats
 * const chats = await WPP.chat.list({onlyCommunities: true});
 *
 * // Only Newsletter
 * const chats = await WPP.chat.list({onlyNewsletter: true});
 *
 * // Only with label Text
 * const chats = await WPP.chat.list({withLabels: ['Test']});
 *
 * // Only with label id
 * const chats = await WPP.chat.list({withLabels: ['1']});
 *
 * // Only with label with one of text or id
 * const chats = await WPP.chat.list({withLabels: ['Alfa','5']});
 *
 * // Only archived chats
 * const chats = await WPP.chat.list({onlyArchived: true});
 *
 * // Ignore group metadata search
 * const chats = await WPP.chat.list({ignoreGroupMetadata: true})
 * ```
 *
 * @category Chat
 */
export async function list(
  options: ChatListOptions = {}
): Promise<ChatModel[]> {
  if (options.waitForSync ?? true) {
    const { waitHistorySync } = await import('./waitHistorySync');
    await waitHistorySync({ timeoutMs: options.syncTimeoutMs });
  }

  // Setting the check to null, so it doesn't break existing codes.
  const count = options.count == null ? Infinity : options.count;
  const direction = options.direction === 'before' ? 'before' : 'after';

  // Getting All Chats.
  // Slice is used here to duplicate the array, then we can modify it without change the WhatsApp internal variables.
  // Also known as "shallow copy".
  let models = options.onlyNewsletter
    ? NewsletterStore.getModelsArray().slice()
    : ChatStore.getModelsArray().slice();

  // Filtering Based on Options.
  if (options.onlyUsers) {
    models = models.filter((c) => c.isUser);
  }

  if (options.onlyGroups) {
    models = models.filter((c) => c.id.isGroup());
  }

  if (options.onlyCommunities) {
    models = models.filter(
      (c) => c.id.isGroup() && c.groupMetadata?.groupType === 'COMMUNITY'
    );
  }

  if (options.onlyWithUnreadMessage) {
    models = models.filter((c) => c.hasUnread);
  }

  if (options.onlyArchived) {
    models = models.filter((c) => c.archive);
  }

  if (options.withLabels) {
    const ids = options.withLabels.map((value) => {
      const label = LabelStore.findFirst((l) => l.name === value);
      return label ? label.id : value;
    });

    models = models.filter((c) => c.labels?.some((id) => ids.includes(id)));
  }

  // Getting The Chat to start from.
  // Searching for chat (index) here, so it gets applied after all filtering.
  const indexChat = options?.id ? get(options.id) : null;
  const startIndex = indexChat ? models.indexOf(indexChat as any) : 0;

  if (direction === 'before') {
    const fixStartIndex = startIndex - count < 0 ? 0 : startIndex - count;
    const fixEndIndex =
      fixStartIndex + count >= startIndex ? startIndex : fixStartIndex + count;
    models = models.slice(fixStartIndex, fixEndIndex);
  } else {
    models = models.slice(startIndex, startIndex + count);
  }

  // Attaching Group Metadata on Found Chats.
  if (!options?.ignoreGroupMetadata) {
    const defaultTimeout = 10000;
    const timeoutMs = options?.groupMetadataTimeout ?? defaultTimeout;

    const promises = models.map(async (chat) => {
      if (chat.id.isGroup()) {
        try {
          const cachedMetadata =
            chat.groupMetadata ?? GroupMetadataStore.get(chat.id);

          if (cachedMetadata && !chat.groupMetadata) {
            chat.groupMetadata = cachedMetadata;
          }

          const metadata = await Promise.race([
            GroupMetadataStore.find(chat.id),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('Timeout fetching group metadata')),
                timeoutMs
              )
            ),
          ]);

          if (metadata && !chat.groupMetadata) {
            chat.groupMetadata = metadata;
          }
        } catch (_e) {
          // Ignora o erro/timeout para não travar a lista
        }
      }
    });

    await Promise.all(promises);
  }

  // Força a re-hidratação e migração das chaves de mensagens de chats carregados
  for (const chat of models) {
    const key = chat.lastReceivedKey;
    if (key) {
      if (typeof key === 'object') {
        MsgKey.from(key);
      }
      void key._serialized;
    }
  }

  return models;
}
