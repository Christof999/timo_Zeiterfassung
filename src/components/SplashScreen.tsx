import '../styles/SplashScreen.css'
import { APP_DISPLAY_NAME } from '../constants/appBranding'

const SplashScreen: React.FC = () => {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <img 
          src="/brand-logo.png" 
          alt="Logo" 
          className="splash-logo"
        />
        <h1 className="splash-title">{APP_DISPLAY_NAME}</h1>
        <p className="splash-subtitle">Mitarbeiter-Zeiterfassung</p>
        <div className="splash-loader">
          <div className="loader-bar"></div>
        </div>
      </div>
    </div>
  )
}

export default SplashScreen

