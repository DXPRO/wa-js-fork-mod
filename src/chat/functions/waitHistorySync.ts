/*!
 * Copyright 2026 WPPConnect Team
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

import { getHistorySyncProgress } from '../../conn/functions/getHistorySyncProgress';
import { Cmd } from '../../whatsapp';

export interface WaitHistorySyncOptions {
  timeoutMs?: number;
  pollingIntervalMs?: number;
}

/**
 * Wait for the background history sync chunks to be processed
 *
 * @example
 * ```javascript
 * await WPP.chat.waitHistorySync({ timeoutMs: 30000 });
 * ```
 *
 * @category Chat
 */
export function waitHistorySync(
  options: WaitHistorySyncOptions = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const pollingIntervalMs = options.pollingIntervalMs ?? 1000;

  return new Promise<void>((resolve) => {
    const initialSync = getHistorySyncProgress();
    if (!initialSync.inProgress) {
      return resolve();
    }

    let timeoutId: any = null;
    let intervalId: any = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      Cmd.off('new_history_sync_chunk_processed_from_bridge', onChunkProcessed);
    };

    const resolveDone = () => {
      cleanup();
      resolve();
    };

    const onChunkProcessed = () => {
      const sync = getHistorySyncProgress();
      if (!sync.inProgress) {
        resolveDone();
      }
    };

    // Ouvinte do evento nativo emitido pela Bridge do WA Web
    Cmd.on('new_history_sync_chunk_processed_from_bridge', onChunkProcessed);

    // Fallback de Polling periódico em caso de falha de disparo do evento ou versão antiga
    intervalId = setInterval(() => {
      const sync = getHistorySyncProgress();
      if (!sync.inProgress) {
        resolveDone();
      }
    }, pollingIntervalMs);

    // Timeout de segurança contra travamentos na fila do WebSocket/Servidor
    timeoutId = setTimeout(() => {
      resolveDone();
    }, timeoutMs);
  });
}
