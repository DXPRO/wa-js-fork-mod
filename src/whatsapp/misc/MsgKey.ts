/*!
 * Copyright 2021 WPPConnect Team
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

import { exportModule } from '../exportModule';
import { Wid } from './Wid';

/** @whatsapp 65212
 * @whatsapp 32219 >= 2.2204.13
 * @whatsapp 465212 >= 2.2222.8
 */
export declare class MsgKey {
  constructor(
    options:
      | {
          from: Wid;
          to: Wid;
          id: string;
          participant?: any;
          selfDir: 'in' | 'out';
        }
      | { fromMe: boolean; remote: Wid; id: string; participant?: any }
  );

  fromMe: boolean;
  id: string;
  remote: Wid;
  participant: any;
  _serialized: string;
  toString(): string;
  clone(): MsgKey;
  equals(key: unknown): key is MsgKey;

  static fromString(key: string): MsgKey;
  static from(key: any): MsgKey;

  /**
   * @whatsapp >= 2.2208.7
   */
  static newId(): Promise<string>;
}

exportModule(
  exports,
  {
    MsgKey: 'default',
  },
  (m) => {
    const isMsgKey =
      m?.default &&
      (m.default.toString().includes('MsgKey error: obj is null/undefined') ||
        (typeof m.default.fromString === 'function' &&
          (m.default.toString().includes('MsgKey') ||
            m.default.toString().includes('fromString') ||
            m.default.prototype?.equals)));
    if (!isMsgKey) {
      return false;
    }

    /**
     * WhatsApp >= 2.3000.1042401057 caches the serialized key in a minified
     * property (`this.$1 = [...].join('_')`) instead of `this._serialized`,
     * so message keys stopped exposing `_serialized` (events like ack and
     * sendMessage delivered ids without it). Alias the minified property
     * back to an own enumerable `_serialized` on each instance.
     */
    try {
      const OriginalMsgKey = m.default;
      const proto = OriginalMsgKey.prototype;

      // 1. Descobrir a propriedade de cache dinamicamente criando uma instância de teste
      let cached: string | undefined = undefined;
      try {
        const wid = new Wid('123@c.us');
        const testKey = new OriginalMsgKey({
          fromMe: true,
          remote: wid,
          id: 'abc',
        });
        const expectedValue = 'true_123@c.us_abc';
        for (const key in testKey) {
          if (testKey[key] === expectedValue) {
            cached = key;
            break;
          }
        }
      } catch (_e) {
        // Ignora falha de instanciação
      }

      // 2. Fallback de regex caso a detecção dinâmica falhe
      try {
        if (!cached && proto.toString) {
          cached = /\bthis\.([$A-Za-z_][\w$]*)/.exec(
            Function.prototype.toString.call(proto.toString)
          )?.[1];
        }
      } catch (_e) {
        // Ignora falha de regex
      }

      // Fallback padrão se tudo falhar
      if (!cached) {
        cached = '$1';
      }

      // 3. Se a propriedade minificada foi encontrada, configura alias no prototype de forma segura e não-recursiva
      if (cached && cached !== '_serialized') {
        Object.defineProperty(proto, '_serialized', {
          configurable: true,
          enumerable: true,
          get: function (this: any) {
            const ownDesc = Object.getOwnPropertyDescriptor(this, cached!);
            if (ownDesc) {
              return ownDesc.value;
            }
            return undefined;
          },
          set: function (this: any, value: string) {
            Object.defineProperty(this, '_serialized', {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });

        Object.defineProperty(proto, cached, {
          configurable: true,
          get: function (this: any) {
            const ownDesc = Object.getOwnPropertyDescriptor(
              this,
              '_serialized'
            );
            if (ownDesc) {
              return ownDesc.value;
            }
            return undefined;
          },
          set: function (this: any, value: string) {
            Object.defineProperty(this, '_serialized', {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          },
        });

        // Função de migração segura e in-place na própria instância (adiciona o _serialized sem deletar o cache nativo)
        const migrateInstance = (key: any) => {
          if (key && cached) {
            const ownDesc = Object.getOwnPropertyDescriptor(key, cached);
            if (
              ownDesc &&
              !Object.prototype.hasOwnProperty.call(key, '_serialized')
            ) {
              Object.defineProperty(key, '_serialized', {
                value: ownDesc.value,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            }
          }
        };

        const originalToString = proto.toString;
        proto.toString = function (this: any) {
          migrateInstance(this);
          return originalToString.call(this);
        };

        // toJSON retorna uma representação limpa sem a propriedade minificada poluindo
        Object.defineProperty(proto, 'toJSON', {
          configurable: true,
          writable: true,
          value: function (this: any) {
            return {
              id: this.id,
              fromMe: this.fromMe,
              remote: this.remote,
              _serialized: this._serialized || this[cached!],
            };
          },
        });

        // Método estático para migração explícita no código do wa-js
        OriginalMsgKey.from = function (key: any) {
          if (key instanceof OriginalMsgKey) {
            migrateInstance(key);
            return key;
          }
          if (key && typeof key === 'object') {
            const newKey = new OriginalMsgKey(key);
            migrateInstance(newKey);
            return newKey;
          }
          return key;
        };
      }

      // 4. Envolver o construtor padrão com um Wrapper para instâncias criadas pelo wa-js
      try {
        const MsgKeyWrapper = function (this: any, ...args: any[]) {
          const instance = Reflect.construct(
            OriginalMsgKey,
            args,
            MsgKeyWrapper
          );
          try {
            if (cached) {
              const ownDesc = Object.getOwnPropertyDescriptor(instance, cached);
              if (ownDesc) {
                // Não deletamos o cache nativo no runtime para evitar quebrar o estado de lido do WhatsApp Web
                Object.defineProperty(instance, '_serialized', {
                  value: ownDesc.value,
                  writable: true,
                  enumerable: true,
                  configurable: true,
                });
              }
            }
          } catch (_e) {
            // Ignora
          }
          return instance;
        };

        // Preserva métodos estáticos e herança do protótipo
        Object.setPrototypeOf(MsgKeyWrapper, OriginalMsgKey);
        MsgKeyWrapper.prototype = OriginalMsgKey.prototype;

        // Sobrescreve a exportação padrão do módulo
        m.default = MsgKeyWrapper as any;
      } catch (_e) {
        // Ignora
      }

      console.info('[WA-JS] MsgKey patch initialized successfully.');
    } catch {}

    return true;
  }
);
