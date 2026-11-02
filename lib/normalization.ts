import katex from 'katex';

export const normalizationHtml = katex.renderToString(String.raw`\mathrm{score} = \frac{1}{1 + \frac{T_k - T_{\mathrm{SOL}}}{T_b - T_{\mathrm{SOL}}}}`, {
  throwOnError: true,
  output: 'htmlAndMathml',
});
