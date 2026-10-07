// Todo el equilibrio, los textos y las rutas de PDF se pueden editar aquí.
window.GAME_CONFIG = {
  bookMethods: ["Aula Invertida", "Gamificación", "ABP", "ApS", "Juegos Serios"],
  startingEnergy: 5,
  maxEnergy: 5,
  questions: [
    { prompt: "¿Qué integra el modelo TPACK?", choices: ["Tecnología, pedagogía y contenido", "Evaluación, currículo y gestión", "Solo tecnología y contenido"], answer: 0 },
    { prompt: "¿Qué significa CK en TPACK?", choices: ["Conocimiento del contenido", "Conocimiento del contexto", "Conocimiento de la comunicación"], answer: 0 },
    { prompt: "¿Qué describe PK?", choices: ["Conocimiento pedagógico", "Conocimiento de programación", "Conocimiento de plataformas"], answer: 0 },
    { prompt: "¿Qué describe TK?", choices: ["Conocimiento tecnológico", "Conocimiento temático", "Conocimiento de tareas"], answer: 0 },
    { prompt: "¿Qué conocimiento combina pedagogía y contenido?", choices: ["PCK", "TCK", "TPK"], answer: 0 },
    { prompt: "¿Qué conocimiento combina tecnología y pedagogía?", choices: ["TPK", "PCK", "TCK"], answer: 0 },
    { prompt: "¿Qué conocimiento combina tecnología y contenido?", choices: ["TCK", "PCK", "PK"], answer: 0 },
    { prompt: "En TPACK, ¿por qué importa el contexto?", choices: ["Orienta cómo integrar los conocimientos en esa situación", "Sustituye el conocimiento pedagógico", "Determina qué aplicación usar siempre"], answer: 0 },
    { prompt: "¿Qué marco español está vigente para la competencia digital docente?", choices: ["MRCDD actualizado en 2022", "MRCDD de 2017", "DigComp 1.0"], answer: 0 },
    { prompt: "¿En qué marco europeo se basa el MRCDD?", choices: ["DigCompEdu", "DigCompOrg exclusivamente", "EntreComp"], answer: 0 },
    { prompt: "¿Cuántas áreas tiene el MRCDD vigente?", choices: ["Seis", "Cuatro", "Ocho"], answer: 0 },
    { prompt: "¿Cuántas competencias reúne el MRCDD?", choices: ["23", "18", "30"], answer: 0 },
    { prompt: "¿Cuál es el área 1 del MRCDD?", choices: ["Compromiso profesional", "Contenidos digitales", "Empoderamiento del alumnado"], answer: 0 },
    { prompt: "¿Cuál es el área 2 del MRCDD?", choices: ["Contenidos digitales", "Enseñanza y aprendizaje", "Evaluación y retroalimentación"], answer: 0 },
    { prompt: "¿Cuál es el área 3 del MRCDD?", choices: ["Enseñanza y aprendizaje", "Compromiso profesional", "Desarrollo digital del alumnado"], answer: 0 },
    { prompt: "¿Qué área se ocupa de evaluación y retroalimentación?", choices: ["Área 4", "Área 2", "Área 6"], answer: 0 },
    { prompt: "¿Qué área trata la inclusión y el compromiso activo del alumnado?", choices: ["Área 5: Empoderamiento del alumnado", "Área 1: Compromiso profesional", "Área 3: Enseñanza y aprendizaje"], answer: 0 },
    { prompt: "¿Qué área aborda el desarrollo de la competencia digital del alumnado?", choices: ["Área 6", "Área 4", "Área 2"], answer: 0 },
    { prompt: "¿Qué competencia específica incorporó el MRCDD actualizado?", choices: ["1.5 Protección de datos, privacidad, seguridad y bienestar digital", "2.5 Programación de aplicaciones", "6.6 Robótica educativa"], answer: 0 },
    { prompt: "¿Qué niveles de progresión utiliza el MRCDD?", choices: ["A1, A2, B1, B2, C1 y C2", "A, B y C sin subdivisiones", "Inicial, medio y experto"], answer: 0 },
    { prompt: "¿Qué orden siguen los niveles del MRCDD?", choices: ["A1, A2, B1, B2, C1, C2", "A1, B1, C1, A2, B2, C2", "A, B, C, D, E, F"], answer: 0 },
    { prompt: "¿Cuál es la última versión publicada del MRCDD que INTEF señala como vigente?", choices: ["La actualización aprobada y publicada en 2022", "Una actualización de 2024", "El marco de 2017"], answer: 0 }
  ],
  maze: [
    "11111111111",
    "10000000001",
    "10111011001",
    "10001000001",
    "10101011101",
    "10000000101",
    "10111010101",
    "10000000021",
    "11111111111"
  ],
  levels: [
    {
      title: "Historial académico",
      pdf: "assets/pdf/PRUEBA_historial.pdf",
      palette: ["#24315e", "#4b75ba", "#68d6d0"],
      enemies: [
        { x: 4.5, y: 1.5, type: "boy-short", hits: 2 },
        { x: 7.5, y: 1.5, type: "girl-long", hits: 2 },
        { x: 7.5, y: 3.5, type: "boy-curly", hits: 3 },
        { x: 3.5, y: 7.5, type: "girl-short", hits: 2 }
      ],
      energyPickups: [{ x: 2.5, y: 3.5 }],
      exit: { x: 9.5, y: 7.5 }
    },
    {
      title: "Proyecto docente",
      pdf: "assets/pdf/PRUEBA_proyecto-docente.pdf",
      palette: ["#4b2d24", "#c27c40", "#f5c85c"],
      maze: [
        "111111111111111",
        "100000000000001",
        "101100010001101",
        "100000000000001",
        "100010000010001",
        "101000111000101",
        "100000000000001",
        "100010000010001",
        "101100010001101",
        "100000000000001",
        "101100010001101",
        "100000000000021",
        "111111111111111"
      ],
      enemies: [
        { x: 3.5, y: 1.5, type: "boy-wavy", hits: 3 },
        { x: 11.5, y: 1.5, type: "girl-long", hits: 2 },
        { x: 5.5, y: 3.5, type: "boy-curly", hits: 3 },
        { x: 9.5, y: 3.5, type: "girl-short", hits: 3 },
        { x: 2.5, y: 6.5, type: "boy-short", hits: 2 },
        { x: 12.5, y: 6.5, type: "girl-curly", hits: 2 },
        { x: 4.5, y: 11.5, type: "girl-wavy", hits: 3 },
        { x: 10.5, y: 11.5, type: "boy-short", hits: 2 }
      ],
      energyPickups: [{ x: 2.5, y: 3.5 }, { x: 12.5, y: 9.5 }],
      exit: { x: 13.5, y: 11.5 }
    },
    {
      title: "Proyecto investigador",
      pdf: "assets/pdf/PRUEBA_proyecto-investigador.pdf",
      palette: ["#3a254e", "#9b4a7b", "#61dce1"],
      enemies: [
        { x: 3.5, y: 1.5, type: "boy-curly", hits: 3 },
        { x: 7.5, y: 1.5, type: "girl-long", hits: 2 },
        { x: 2.5, y: 3.5, type: "girl-short", hits: 2 },
        { x: 6.5, y: 3.5, type: "boy-wavy", hits: 3 },
        { x: 1.5, y: 5.5, type: "girl-curly", hits: 3 },
        { x: 3.5, y: 5.5, type: "boy-short", hits: 2 },
        { x: 5.5, y: 5.5, type: "girl-wavy", hits: 3 },
        { x: 7.5, y: 5.5, type: "boy-long", hits: 2 },
        { x: 2.5, y: 7.5, type: "girl-long", hits: 2 },
        { x: 6.5, y: 7.5, type: "boy-curly", hits: 3 }
      ],
      energyPickups: [{ x: 5.5, y: 3.5 }, { x: 4.5, y: 7.5 }, { x: 9.5, y: 5.5 }],
      exit: { x: 9.5, y: 7.5 }
    }
  ]
};
