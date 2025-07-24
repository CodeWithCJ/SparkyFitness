export default defineAppConfig({
  docus: {
    title: 'SparkyFitness Docs',
    description: 'Docs and guides around SparkyFitness',
    socials: {
      github: 'CodeWithCJ/SparkyFitness',
    },
    aside: {
      level: 0,
      collapsed: false,
      exclude: []
    },
    main: {
      padded: true,
      fluid: true
    },
    header: {
      logo: true,
      showLinkIcon: true,
      exclude: [],
      fluid: true
    },
    // Add a home property to explicitly define the home page
    home: {
      title: 'Welcome to SparkyFitness',
      description: 'Your comprehensive fitness tracking solution.'
    },
  }
})
