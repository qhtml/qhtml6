import * as cmState from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmLanguage from '@codemirror/language';
import * as cmCommands from '@codemirror/commands';
import * as cmCore from 'codemirror';
import * as cmLangHtml from '@codemirror/lang-html';
import * as cmLangCss from '@codemirror/lang-css';
import * as cmLangJavascript from '@codemirror/lang-javascript';
import * as lezerHighlight from '@lezer/highlight';

const root = typeof window !== 'undefined' ? window : globalThis;

root.CM = {
  '@codemirror/state': cmState,
  '@codemirror/view': cmView,
  '@codemirror/language': cmLanguage,
  '@codemirror/commands': cmCommands,
  'codemirror': cmCore,
  '@codemirror/lang-html': cmLangHtml,
  '@codemirror/lang-css': cmLangCss,
  '@codemirror/lang-javascript': cmLangJavascript,
  '@lezer/highlight': lezerHighlight
};
