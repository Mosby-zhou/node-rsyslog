export type AccessLog = {
  /**
   * ISO 8601
   * YYYY-MM-DDThh:mm:ss.sTZD, i.e. `1997-07-16T19:20:30.45+01:00`, `1997-07-16T19:20:30.45Z`
   */
  time: string;
  /**
   * trace id
   */
  id?: string;
  remote_ip: string;
  remote_user?: string;
  remote_project?: string;
  host: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  uri: string;
  user_agent: string;
  http_referer?: string;
  status: number;
  error?: string;
  /**
   * ns, i.e. 2ms: `2000000`.
   */
  latency: number;
  /**
   * ms, i.e. `2ms`.
   */
  latency_human: string;
  bytes_in: number;
  bytes_out: number;
  /**
   * If request body is not json, use { "__text__": text }. value max length is 1000.
   */
  snapshot?: {
    [key: string]: string;
  };
  /**
   * If response body is not json, use { "__text__": text }. value max length is 1000.
   */
  response_body?: {
    [key: string]: string;
  };
};

export type RequestLog = {
  /**
   * ISO 8601
   * YYYY-MM-DDThh:mm:ss.sTZD, i.e. `1997-07-16T19:20:30.45+01:00`, `1997-07-16T19:20:30.45Z`
   */
  time: string;
  /**
   * trace id
   */
  id?: string;
  method: 'GET' | 'POST' | 'DELETE' | 'PUT';
  uri: string;
  status: number;
  /**
   * ns, i.e. 2ms: `2000000`.
   */
  latency: number;
  /**
   * ms, i.e. `2ms`.
   */
  latency_human: string;
  bytes_in: number;
  bytes_out: number;
  /**
   * If request body is not json, use { "__text__": text }. value max length is 1000.
   */
  snapshot?: {
    [key: string]: string;
  };
  /**
   * If response body is not json, use { "__text__": text }. value max length is 1000.
   */
  response_body?: {
    [key: string]: string;
  };
};
