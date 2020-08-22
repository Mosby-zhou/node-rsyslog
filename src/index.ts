import { hostname } from 'os';
import net from 'net';
import dgram from 'dgram';
import { EventEmitter } from 'events';

// https://tools.ietf.org/html/rfc5424#section-6.2.1

export enum FACILITY {
  kern = 0,
  user = 1,
  mail = 2,
  daemon = 3,
  auth = 4,
  syslog = 5,
  lpr = 6,
  news = 7,
  uucp = 8,
  cron = 9,
  security = 10,
  ftp = 11,
  ntp = 12,
  logaudit = 13,
  logalert = 14,
  clock = 15,
  local0 = 16,
  local1 = 17,
  local2 = 18,
  local3 = 19,
  local4 = 20,
  local5 = 21,
  local6 = 22,
  local7 = 23,
}

export enum SEVERITY {
  EMERG = 0,
  ALERT = 1,
  CRIT = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFO = 6,
  DEBUG = 7,
}

export const NILVALUE = '-';

const BOM = Buffer.from('EFBBBF', 'hex');

const DELIMITER = Buffer.from(' ', 'ascii');

/**
 * Syslog UDP options.
 */
export type RSyslogOptions = {
  /**
   * Host to which to send packets. Defaults to `127.0.0.1`.
   */
  host: string;

  /**
   * Port to which to send packets. Defaults to `514`.
   */
  port: number;

  /**
   * Send packets use tcp or udp. Defaults to `UDP`.
   */
  method?: 'TCP' | 'UDP';

  /**
   * Sender's [APPNAME]. Defaults to NILVALUE, i.e. `-`.
   *
   * [APPNAME]: https://tools.ietf.org/html/rfc5424#section-6.2.5
   */
  appname?: string;

  /**
   * Sender's [facility]. Defaults to `local0`.
   *
   * [facility]: https://tools.ietf.org/html/rfc5424#section-6.2.1
   */
  facility: FACILITY;

  /**
   * Sender's [HOSTNAME]. Defaults to `os.hostname()`.
   *
   * [HOSTNAME]: https://tools.ietf.org/html/rfc5424#section-6.2.4
   */
  hostname?: string;

  /**
   * Sender's [PROCID]. Defaults to `process.pid`.
   *
   * [PROCID]: https://tools.ietf.org/html/rfc5424#section-6.2.6
   */
  procid?: number;

  /**
   * Utf8 with BOM [PROCID]. Defaults to `false`.
   */
  bom?: boolean;
};

/**
 * Message send options.
 */
export type RSyslogSendOptions = {
  /**
   * Timestamp of this message, as ms since epoch. Defaults to `Date.now()`.
   */
  timestamp?: number;

  /**
   * [MSGID]. Defaults to NILVALUE, i.e. `-`.
   *
   * [MSGID]: https://tools.ietf.org/html/rfc5424#section-6.2.7
   */
  msgid?: string;
};

const defaultRSyslogOptions: RSyslogOptions = {
  host: '127.0.0.1',
  port: 514,
  method: 'UDP',
  appname: NILVALUE,
  facility: FACILITY.local0,
  hostname: hostname(),
  procid: process.pid,
  bom: false,
};

/**
 * A rsyslog client. Sends over UDP.
 */
export class RSyslog extends EventEmitter {
  private options: RSyslogOptions;
  private udpSocket?: dgram.Socket;
  private tpcSocket?: net.Socket;
  private pending: Buffer[];
  private running: boolean;

  constructor(options?: RSyslogOptions) {
    super();
    this.options = {
      ...defaultRSyslogOptions,
      ...options,
    };
    this.pending = [];
    this.handleSendResult = this.handleSendResult.bind(this);
    this.running = false;
  }

  /**
   * Create an open a socket, if necessary.
   * Either way, return it.
   */
  private async connectUDP(): Promise<dgram.Socket> {
    if (this.udpSocket) {
      return this.udpSocket;
    } else {
      const version = net.isIPv6(this.options.host) ? 'udp6' : 'udp4';
      console.log(`socket opening (${version})`);
      this.udpSocket = dgram.createSocket({
        reuseAddr: true,
        type: version,
      });
      this.udpSocket.on('close', () => this.socketClose());
      this.udpSocket.on('error', (err) => this.socketError(err));
      this.udpSocket.unref();
      console.log(`udp socket open`);
      return this.udpSocket;
    }
  }

  /**
   * Create an open a socket, if necessary.
   * Either way, return it.
   */
  private async connectTCP(): Promise<net.Socket> {
    if (this.tpcSocket) {
      return this.tpcSocket;
    } else {
      const socket: net.Socket = await new Promise<net.Socket>((resolve, reject) => {
        try {
          const socket: net.Socket = net.connect(this.options.port, this.options.host);
          socket.on('close', () => this.socketClose());
          socket.on('error', (err) => this.socketError(err));
          socket.on('connect', () => resolve(socket));
          socket.unref();
        } catch (e) {
          reject(e);
        }
      });
      console.log(`tcp socket open`);
      this.tpcSocket = socket;
      return this.tpcSocket;
    }
  }

  /**
   * Handle the socket's `close` event'.
   */
  private socketClose() {
    console.log('socket closed');
    this.tpcSocket = undefined;
    this.udpSocket = undefined;
  }

  /**
   * Propagate the socket's `error` event.
   */
  private socketError(err: Error) {
    console.log('socket error', err.message);
    this.emit('error', err);
    this.disconnect();
  }

  /**
   * Close the socket, if it's still open.
   */
  public disconnect(): void {
    if (this.options.method === 'TCP' && this.tpcSocket) {
      console.log('socket closing...');
      this.tpcSocket.destroy();
      this.tpcSocket = undefined;
    }
    if (this.options.method === 'UDP' && this.udpSocket) {
      console.log('socket closing...');
      this.udpSocket.close();
      this.udpSocket = undefined;
    }
  }

  /**
   * Send a message to the rsyslogd. Pretends to be synchronous.
   */
  public send(severity: SEVERITY, message: string, options?: RSyslogSendOptions): void {
    if (severity < 0 || severity > 7) {
      throw new Error(`severity should in 0-7`);
    }
    if (message.length < 1 || (this.options.method === 'UDP' && message.length > 1024)) {
      throw new Error(`message.length should in 1-1024`);
    }
    const facility = this.options.facility;
    const priority = (facility << 3) | severity;
    const { hostname, appname, procid } = this.options;
    const timeStr = new Date(options?.timestamp || Date.now()).toISOString();
    const header = `<${priority}>1 ${timeStr} ${hostname} ${appname} ${procid} ${options?.msgid || NILVALUE}`;
    const structured = NILVALUE;
    const buf = Buffer.concat([
      Buffer.from(header, 'ascii'),
      DELIMITER,
      Buffer.from(structured, 'ascii'),
      DELIMITER,
      this.options.bom ? BOM : Buffer.from([]),
      Buffer.from(message, 'utf8'),
    ]);
    this.queueMessage(buf);
  }

  /**
   * Queue another buffer to be sent.
   */
  private queueMessage(buf: Buffer): void {
    console.log('queue', buf.toString());
    this.pending.push(buf);
    this.start();
  }

  /**
   * Send the next message.
   */
  private async sendNextMessage() {
    if (!this.pending.length) {
      console.log('spurious sendNextMessage');
      this.stop();
      return;
    }

    const buf = this.pending.shift();
    this.continue();

    if (!buf) {
      console.log('undefined buf');
      return;
    }

    try {
      if (this.options.method === 'TCP') {
        const socket = await this.connectTCP();
        socket.write(Buffer.concat([buf, Buffer.from('\n', 'ascii')]), this.handleSendResult);
      } else if (this.options.method === 'UDP') {
        const socket = await this.connectUDP();
        const { port, host } = this.options;
        socket.send(buf, 0, buf.byteLength, port, host, this.handleSendResult);
      }
    } catch (err) {
      this.handleSendResult(err);
    }
  }

  /**
   * Handle send results. On errors, report them upstream. That could be
   * ignored, result in our destruction and re-creation, or result in the
   * process crashing. So, we keep sending anyway, as we're the only object
   * with a reference to the unsent messages.
   */
  private handleSendResult(err?: Error | null, bytes?: number): void {
    if (err) {
      console.log('error', err);
      this.emit('error', err);
    } else {
      console.log('sent', bytes);
    }
  }

  /**
   * Start sending.
   */
  private start() {
    if (!this.running) {
      this.running = true;
      this.continue();
    }
  }

  /**
   * Continue sending if there are more packets, else stop.
   */
  private continue() {
    if (this.pending.length) {
      setImmediate(() => this.sendNextMessage());
    } else {
      this.stop();
    }
  }

  /**
   * Stop sending.
   */
  private stop() {
    if (this.running) {
      this.running = false;
    }
  }
}
