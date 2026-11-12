import katex from 'katex';

export const normalizationHtml = katex.renderToString(String.raw`\mathrm{score} = \begin{cases} 0 & \text{missing or zero reward} \\ 1 & T_k \leq T_{\mathrm{SOL}} \\ \displaystyle\frac{1}{1 + \frac{T_k - T_{\mathrm{SOL}}}{T_b - T_{\mathrm{SOL}}}} & \text{otherwise} \end{cases}`, {
  throwOnError: true,
  output: 'htmlAndMathml',
});
