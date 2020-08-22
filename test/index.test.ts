import { RSyslog } from '../src/index';

/**
 * Dummy test
 */
describe('Dummy test', () => {
  it('works if true is truthy', async () => {
    expect(true).toBeTruthy();
  });

  it('DummyClass is instantiable', () => {
    expect(new RSyslog()).toBeInstanceOf(RSyslog);
  });
});
