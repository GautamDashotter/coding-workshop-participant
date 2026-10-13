import { createTheme } from '@mui/material/styles';

/** Named palette: ink and paper for structure, three signal colors for delivery health. */
export const palette = {
  ink: '#18222F',
  inkSoft: '#4A5566',
  paper: '#F3F5F2',
  surface: '#FFFFFF',
  rule: '#D9DED6',
  blueprint: '#2F4BA0',
  onTrack: '#0E7C66',
  atRisk: '#A86A08',
  highRisk: '#B42318',
};

const font = '"Archivo", "Helvetica Neue", Arial, sans-serif';

const theme = createTheme({
  palette: {
    primary: { main: palette.blueprint },
    secondary: { main: palette.ink },
    success: { main: palette.onTrack },
    warning: { main: palette.atRisk },
    error: { main: palette.highRisk },
    background: { default: palette.paper, paper: palette.surface },
    text: { primary: palette.ink, secondary: palette.inkSoft },
    divider: palette.rule,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: font,
    h1: { fontSize: '1.9rem', fontWeight: 650, fontStretch: '85%', letterSpacing: '-0.01em' },
    h2: { fontSize: '1.4rem', fontWeight: 650, fontStretch: '85%' },
    h3: { fontSize: '1.1rem', fontWeight: 650 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: { borderColor: palette.rule } },
    },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTableCell: {
      styleOverrides: {
        head: { fontWeight: 600, color: palette.inkSoft, fontSize: '0.8rem' },
      },
    },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
  },
});

export default theme;
