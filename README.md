# PDLPOperator

## Install packages

```
yarn
```

## Compile

```
npx hardhat compile
```

## Deployment

### Run deploy script from console

```
rollup migrations/1_ethereum_operator.js -o migrations/hardhat.js -m cjs && npx hardhat run migrations/hardhat.js --network kovan
```

### Run deploy script from remix

```
rollup migrations/1_ethereum_operator.js -o migrations/remix.js -m cjs && remixd -s $PWD --remix-ide https://remix.ethereum.org
```
