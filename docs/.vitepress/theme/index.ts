import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import EnvGenerator from '../../components/EnvGenerator.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('EnvGenerator', EnvGenerator);
  },
} satisfies Theme;
