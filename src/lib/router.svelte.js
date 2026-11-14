// Hash routes: #/stats, #/post/<id>. The same on the web and inside the native apps, and the server
// never has to know about them.
const HOME = 'track';

function parse() {
  // Everything after the screen name is its param, slashes included (#/memories/thread/x:1).
  const [name = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || HOME, param: decodeURIComponent(rest.join('/')) };
}

/** The current screen: { name: 'track' | 'stats' | 'feed' | 'memories' | 'post' | 'person' | 'you', param }. */
export const route = $state(parse());

addEventListener('hashchange', () => {
  Object.assign(route, parse());
  scrollTo(0, 0);
});

/** The link to a screen. @param {string} name @param {string} [param] */
export const href = (name, param) =>
  `#/${name === HOME ? '' : name}${param ? `/${encodeURIComponent(param)}` : ''}`;

/** Goes to a screen. @param {string} name @param {string} [param] */
export function go(name, param) {
  location.hash = href(name, param);
}
