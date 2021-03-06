import { Duplex, Writable } from "stream";

import fetch from "cross-fetch";
// import Msgpack from "msgpack5";

import { base64Encode } from "@timberio/tools";
import { ITimberLog, ITimberOptions, LogLevel } from "@timberio/types";
import { Base } from "@timberio/core";

import { getUserAgent } from "./helpers";

// Namespace the msgpack library
// const msgpack = Msgpack();

export class Node extends Base {
  /**
   * Readable/Duplex stream where JSON stringified logs of type `ITimberLog`
   * will be pushed after syncing
   */
  private _writeStream?: Writable | Duplex;

  public constructor(apiKey: string, options?: Partial<ITimberOptions>) {
    super(apiKey, options);

    // Sync function
    const sync = async (logs: ITimberLog[]): Promise<ITimberLog[]> => {
      const res = await fetch(this._options.endpoint, {
        method: "POST",
        headers: {
          // "Content-Type": "application/msgpack",
          "Content-Type": "application/json",
          Authorization: `Basic ${base64Encode(this._apiKey)}`,
          "User-Agent": getUserAgent()
        },
        // body: logs.map(log => `${log.level}: ${log.message}`).join("\n")
        // body: msgpack.encode(logsWithSchema).slice()

        // TODO - using JSON for now; switch to msgpack later
        body: JSON.stringify(logs)
      });

      if (res.ok) {
        return logs;
      }

      /**
       * TODO: if status is 50x throw custom ServerError
       * to be used in retry logic
       */
      throw new Error(res.statusText);
    };

    // Set the throttled sync function
    this.setSync(sync);
  }

  /**
   * Override `Base` log to enable Node.js streaming
   *
   * @param message: string - Log message
   * @param level (LogLevel) - Level to log at (debug|info|warn|error)
   * @param log: (Partial<ITimberLog>) - Initial log (optional)
   * @returns Promise<ITimberLog> after syncing
   */
  public async log(
    message: string,
    level?: LogLevel,
    log?: Partial<ITimberLog>
  ): Promise<ITimberLog> {
    // Process/sync the log, per `Base` logic
    const processedLog = await super.log(message, level, log);

    // Push the processed log to the stream, for piping
    if (this._writeStream) {
      this._writeStream.write(JSON.stringify(processedLog) + "\n");
    }

    // Return the transformed log
    return processedLog;
  }

  /**
   * Pipe JSON stringified `ITimberLog` to a stream after syncing
   *
   * @param stream - Writable|Duplex stream
   */
  public pipe(stream: Writable | Duplex) {
    this._writeStream = stream;
    return stream;
  }
}
