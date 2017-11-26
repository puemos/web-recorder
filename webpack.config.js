const { resolve } = require('path')
const webpack = require('webpack')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const { getIfUtils, removeEmpty } = require('webpack-config-utils')

const packageJSON = require('./package.json')
const packageName = normalizePackageName(packageJSON.name)
const LIB_NAME = pascalCase(packageName)
const PATHS = {
  entryPoint: resolve(__dirname, 'src/index.ts'),
  umd: resolve(__dirname, 'dist')
}

const DEFAULT_ENV = 'dev'

const EXTERNALS = {}

const RULES = {
  ts: {
    test: /\.ts?$/,
    include: /src/,
    use: [
      {
        loader: 'ts-loader',
        options: {
          compilerOptions: {
            declarationDir: 'types'
          }
        }
      }
    ]
  }
}
const config = (env = DEFAULT_ENV) => {
  const { ifProd, ifNotProd } = getIfUtils(env)
  const PLUGINS = removeEmpty([
    // enable scope hoisting
    new webpack.optimize.ModuleConcatenationPlugin(),
    ifProd(
      new UglifyJsPlugin({
        sourceMap: true,
        parallel: true,
        uglifyOptions: {
          warnings: false,
          output: { comments: false }
        }
      })
    ),
    new webpack.LoaderOptionsPlugin({
      debug: false,
      minimize: true
    }),
    new webpack.DefinePlugin({
      'process.env': { NODE_ENV: ifProd('"production"', '"development"') }
    })
  ])

  const UMDConfig = {
    entry: {
      [ifProd(`${packageName}.min`, packageName)]: [PATHS.entryPoint]
    },

    output: {
      path: PATHS.umd,
      filename: '[name].js',
      libraryTarget: 'umd',
      library: LIB_NAME,

      umdNamedDefine: true
    },

    resolve: {
      extensions: ['.ts', '.js']
    },

    externals: EXTERNALS,

    devtool: 'source-map',
    plugins: PLUGINS,
    module: {
      rules: [RULES.ts]
    }
  }

  return [UMDConfig]
}

module.exports = config

// helpers

function camelCaseToDash(myStr) {
  return myStr.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
}

function dashToCamelCase(myStr) {
  return myStr.replace(/-([a-z])/g, g => g[1].toUpperCase())
}

function toUpperCase(myStr) {
  return `${myStr.charAt(0).toUpperCase()}${myStr.substr(1)}`
}

function pascalCase(myStr) {
  return toUpperCase(dashToCamelCase(myStr))
}

function normalizePackageName(rawPackageName) {
  const scopeEnd = rawPackageName.indexOf('/') + 1

  return rawPackageName.substring(scopeEnd)
}
