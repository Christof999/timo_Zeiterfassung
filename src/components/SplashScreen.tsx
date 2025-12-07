import '../styles/SplashScreen.css'

const SplashScreen: React.FC = () => {
  return (
    <div className="splash-screen">
      <div className="splash-content">
        <img 
          src="https://anfragenmanager.s3.eu-central-1.amazonaws.com/Logo_Lauffer_RGB.png" 
          alt="Lauffer Logo" 
          className="splash-logo"
        />
        <h1 className="splash-title">Lauffer Zeiterfassung</h1>
        <p className="splash-subtitle">Gartenbau • Erdbau • Natursteinhandel</p>
        <div className="splash-loader">
          <div className="loader-bar"></div>
        </div>
      </div>
    </div>
  )
}

export default SplashScreen

