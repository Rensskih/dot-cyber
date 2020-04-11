import React, { PureComponent } from 'react';
import { Text, Pane } from '@cybercongress/gravity';
import Dinamics from './dinamics';
import Statistics from './statistics';
import Table from './table';
import ActionBarTakeOff from './actionBar';
import { asyncForEach, formatNumber } from '../../utils/utils';
import { Loading } from '../../components/index';
import { COSMOS, TAKEOFF } from '../../utils/config';
import {
  cybWon,
  funcDiscount,
  getEstimation,
  getDataPlot,
  getRewards,
  getGroupAddress,
} from '../../utils/fundingMath';
import { getTxCosmos } from '../../utils/search/utils';

const dateFormat = require('dateformat');

const { ATOMsALL } = TAKEOFF;
const { GAIA_WEBSOCKET_URL } = COSMOS;

const diff = (key, ...arrays) =>
  [].concat(
    ...arrays.map((arr, i) => {
      const others = arrays.slice(0);
      others.splice(i, 1);
      const unique = [...new Set([].concat(...others))];
      return arr.filter(x => !unique.some(y => x[key] === y[key]));
    })
  );

const test = {
  'tx.hash': [
    '1320F2C5F9022E21533BAB4F3E1938AD7C9CA493657C98E7435A44AA2850636B',
  ],
  'tx.height': ['1489670'],
  'transfer.recipient': ['cosmos1809vlaew5u5p24tvmse9kvgytwwr3ej7vd7kgq'],
  'transfer.amount': ['100000000uatom'],
  'message.sender': ['cosmos1gw5kdey7fs9wdh05w66s0h4s24tjdvtcxlwll7'],
  'message.module': ['bank'],
  'message.action': ['send'],
  'tm.event': ['Tx'],
};

class Funding extends PureComponent {
  ws = new WebSocket(GAIA_WEBSOCKET_URL);

  constructor(props) {
    super(props);
    this.state = {
      groups: [],
      amount: 0,
      pocketAdd: null,
      dataTxs: null,
      atomLeff: 0,
      won: 0,
      pin: false,
      currentPrice: 0,
      currentDiscount: 0,
      dataPlot: [],
      dataRewards: [],
      loader: true,
      loading: 0,
    };
  }

  async componentDidMount() {
    await this.getDataWS();
    await this.getTxsCosmos();
  }

  getTxsCosmos = async () => {
    const dataTx = await getTxCosmos();
    if (dataTx !== null) {
      this.setState({
        dataTxs: dataTx.txs,
      });
      this.init(dataTx);
    }
  };

  getDataWS = async () => {
    this.ws.onopen = () => {
      console.log('connected Funding');
      this.ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'subscribe',
          id: '0',
          params: {
            query: `tm.event='Tx' AND transfer.recipient='${COSMOS.ADDR_FUNDING}' AND message.action='send'`,
          },
        })
      );
    };

    this.ws.onmessage = async evt => {
      const message = JSON.parse(evt.data);
      if (message.id.indexOf('0#event') !== -1) {
        this.updateWs(message.result.events);
      }
      console.warn('txs', message);
    };

    this.ws.onclose = () => {
      console.log('disconnected');
    };
  };

  updateWs = async data => {
    let amount = 0;
    const amountWebSocket = data['transfer.amount'][0];

    if (amountWebSocket.indexOf('uatom') !== -1) {
      const positionDenom = amountWebSocket.indexOf('uatom');
      const str = amountWebSocket.slice(0, positionDenom);
      amount = parseFloat(str) / COSMOS.DIVISOR_ATOM;
    }
    const d = new Date();
    const timestamp = dateFormat(d, 'dd/mm/yyyy, h:MM:ss TT');
    const dataTxs = {
      amount,
      txhash: data['tx.hash'][0],
      height: data['tx.height'][0],
      timestamp,
      sender: data['message.sender'][0],
    };
    const pocketAddLocal = localStorage.getItem('pocket');
    if (pocketAddLocal !== null) {
      const pocketAdd = JSON.parse(pocketAddLocal);
      this.setState({ pocketAdd });
    }
    await this.getStatisticsWs(dataTxs.amount);
    this.getData();
    await this.getTableData();
    this.getTableDataWs(dataTxs);
  };

  init = async txs => {
    console.log(txs);
    const pocketAddLocal = localStorage.getItem('pocket');
    const pocketAdd = JSON.parse(pocketAddLocal);
    this.setState({ pocketAdd });
    await this.getStatistics(txs);
    this.getTableData();
    this.getData();
    this.getPlot();
  };

  getStatisticsWs = async amountWebSocket => {
    const { amount } = this.state;
    let amountWs = 0;

    amountWs = amount + amountWebSocket;
    const atomLeffWs = ATOMsALL - amountWs;
    const currentDiscountWs = funcDiscount(amountWs);
    const wonWs = cybWon(amountWs);
    const currentPriceWs = wonWs / amountWs;

    this.setState({
      amount: amountWs,
      atomLeff: atomLeffWs,
      won: wonWs,
      currentPrice: currentPriceWs,
      currentDiscount: currentDiscountWs,
    });
  };

  getTableDataWs = async dataTxs => {
    const { currentPrice, currentDiscount, amount, groups } = this.state;
    try {
      console.log(groups);
      const dataWs = dataTxs;
      const tempData = [];
      let estimation = 0;
      if (amount <= ATOMsALL) {
        let tempVal = amount - dataTxs.amount;
        if (tempVal >= ATOMsALL) {
          tempVal = ATOMsALL;
        }
        estimation =
          getEstimation(currentPrice, currentDiscount, amount, amount) -
          getEstimation(currentPrice, currentDiscount, amount, tempVal);
        dataWs.cybEstimation = estimation;
        groups[dataWs.sender].address = [
          dataWs,
          ...groups[dataWs.sender].address,
        ];
        groups[dataWs.sender].height = dataWs.height;
        groups[dataWs.sender].amountСolumn += dataWs.amount;
        groups[dataWs.sender].cyb += estimation;
      }
      // const groupsAddress = getGroupAddress(table);
      // localStorage.setItem(`groups`, JSON.stringify(groups));
      this.setState({
        groups,
      });
    } catch (error) {
      console.log(error);
      throw new Error();
    }
  };

  getStatistics = async data => {
    const dataTxs = data.txs;
    console.log('dataTxs', dataTxs);
    // const statisticsLocalStorage = JSON.parse(
    //   localStorage.getItem('statistics')
    // );

    let amount = 0;
    let atomLeff = 0;
    let currentDiscount = 0;
    let won = 0;
    let currentPrice = 0;
    for (let item = 0; item < dataTxs.length; item++) {
      if (amount <= ATOMsALL) {
        amount +=
          Number.parseInt(
            dataTxs[item].tx.value.msg[0].value.amount[0].amount,
            10
          ) / COSMOS.DIVISOR_ATOM;
      } else {
        amount = ATOMsALL;
        break;
      }
    }
    // if (statisticsLocalStorage !== null) {
    //   amount += statisticsLocalStorage.amount;
    // }
    console.log('amount', amount);
    atomLeff = ATOMsALL - amount;
    currentDiscount = funcDiscount(amount);
    won = cybWon(amount);
    currentPrice = won / amount;
    console.log('won', won);
    console.log('currentDiscount', currentDiscount);
    // localStorage.setItem(`statistics`, JSON.stringify(statistics));
    this.setState({
      amount,
      atomLeff,
      won,
      currentPrice,
      currentDiscount,
      loader: false,
    });
  };

  getPlot = async () => {
    const {
      pocketAdd,
      dataTxs,
      currentPrice,
      currentDiscount,
      amount,
    } = this.state;
    // console.log('dataAllPin', dataAllPin);

    const Plot = [];
    const dataAxisRewards = {
      type: 'scatter',
      x: 0,
      y: 0,
      line: {
        width: 2,
        color: '#36d6ae',
      },
      hoverinfo: 'none',
    };
    if (amount <= ATOMsALL) {
      const rewards = getRewards(currentPrice, currentDiscount, amount, amount);
      const rewards0 = getRewards(currentPrice, currentDiscount, amount, 0);
      dataAxisRewards.y = [rewards0, rewards];
      dataAxisRewards.x = [0, amount];
    } else {
      const rewards = getRewards(
        currentPrice,
        currentDiscount,
        ATOMsALL,
        ATOMsALL
      );
      const rewards0 = getRewards(currentPrice, currentDiscount, ATOMsALL, 0);
      dataAxisRewards.y = [rewards0, rewards];
      dataAxisRewards.x = [0, ATOMsALL];
    }

    Plot.push(dataAxisRewards);
    if (pocketAdd !== null) {
      // localStorage.setItem(`dataRewards`, JSON.stringify(Plot));
      this.setState({
        dataRewards: Plot,
      });
      let amountAtom = 0;
      let temp = 0;
      const group = pocketAdd.cosmos.bech32;
      // asyncForEach(Array.from(Array(dataTxs.length).keys()), async item => {
      for (let item = 0; item < dataTxs.length; item++) {
        let estimation = 0;
        const colorPlot = group.replace(/[^0-9]/g, '').substr(0, 6);
        const tempArrPlot = {
          x: 0,
          y: 0,
          estimationPlot: 0,
          fill: 'tozeroy',
          type: 'scatter',
          line: {
            width: 2,
            color: '#36d6ae',
          },
          hovertemplate: '',
        };
        const address = dataTxs[item].tx.value.msg[0].value.from_address;
        const amou =
          Number.parseInt(
            dataTxs[item].tx.value.msg[0].value.amount[0].amount,
            10
          ) / COSMOS.DIVISOR_ATOM;
        if (address === group) {
          if (amountAtom <= ATOMsALL) {
            const x0 = amountAtom;
            const y0 = getRewards(currentPrice, currentDiscount, amount, x0);
            amountAtom += amou;
            const x = amountAtom;
            const y = getRewards(
              currentPrice,
              currentDiscount,
              amount,
              amountAtom
            );
            // const tempVal = temp + amou;
            let tempVal = temp + amou;
            if (tempVal >= ATOMsALL) {
              tempVal = ATOMsALL;
            }
            estimation =
              getEstimation(currentPrice, currentDiscount, amount, tempVal) -
              getEstimation(currentPrice, currentDiscount, amount, temp);
            temp += amou;
            // console.log('estimation', estimation);
            tempArrPlot.estimationPlot = estimation;
            tempArrPlot.hovertemplate =
              `My CYBs estimation: ${formatNumber(
                Math.floor(estimation * 10 ** -9 * 1000) / 1000,
                3
              )}` +
              `<br>Atoms: ${formatNumber(
                Math.floor((x - x0) * 10 ** -3 * 1000) / 1000,
                3
              )}k` +
              '<extra></extra>';
            tempArrPlot.x = [x0, x];
            tempArrPlot.y = [y0, y];
            Plot.push(tempArrPlot);
          } else {
            amountAtom += amou;
            temp += amou;
            break;
          }
        } else {
          amountAtom += amou;
          temp += amou;
        }
      }
      // localStorage.setItem(`dataRewards`, JSON.stringify(Plot));
      this.setState({
        dataRewards: Plot,
      });
    } else {
      // localStorage.setItem(`dataRewards`, JSON.stringify(Plot));
      this.setState({
        dataRewards: Plot,
      });
    }
  };

  getTableData = async () => {
    const {
      dataTxs,
      currentPrice,
      currentDiscount,
      amount,
      dataAllPin,
    } = this.state;
    try {
      const table = [];
      let temp = 0;
      for (let item = 0; item < dataTxs.length; item++) {
        let estimation = 0;
        if (temp <= ATOMsALL) {
          const val =
            Number.parseInt(
              dataTxs[item].tx.value.msg[0].value.amount[0].amount,
              10
            ) / COSMOS.DIVISOR_ATOM;
          let tempVal = temp + val;
          if (tempVal >= ATOMsALL) {
            tempVal = ATOMsALL;
          }
          estimation =
            getEstimation(currentPrice, currentDiscount, amount, tempVal) -
            getEstimation(currentPrice, currentDiscount, amount, temp);
          temp += val;
        } else {
          break;
        }
        const d = new Date(dataTxs[item].timestamp);
        table.push({
          txhash: dataTxs[item].txhash,
          height: dataTxs[item].height,
          from: dataTxs[item].tx.value.msg[0].value.from_address,
          timestamp: dateFormat(d, 'dd/mm/yyyy, h:MM:ss TT'),
          amount:
            Number.parseInt(
              dataTxs[item].tx.value.msg[0].value.amount[0].amount,
              10
            ) / COSMOS.DIVISOR_ATOM,
          estimation,
        });
      }

      const groupsAddress = getGroupAddress(table);
      // localStorage.setItem(`groups`, JSON.stringify(groups));
      console.log('groups', groupsAddress);

      this.setState({
        groups: groupsAddress,
      });
      this.checkPin();
    } catch (error) {
      throw new Error();
    }
  };

  checkPin = async () => {
    const { pocketAdd, groups } = this.state;
    let pin = false;
    if (pocketAdd !== null) {
      if (groups[pocketAdd.cosmos.bech32]) {
        groups[pocketAdd.cosmos.bech32].pin = true;
        pin = true;
      }
      this.setState({
        groups,
        pin,
      });
    }
  };

  getData = async () => {
    const { amount } = this.state;
    let dataPlot = [];
    dataPlot = getDataPlot(amount);
    // localStorage.setItem(`dataPlot`, JSON.stringify(dataPlot));
    this.setState({
      dataPlot,
    });
  };

  render() {
    const {
      groups,
      atomLeff,
      won,
      currentPrice,
      currentDiscount,
      dataPlot,
      dataAllPin,
      dataRewards,
      pin,
      loader,
    } = this.state;

    if (loader) {
      return (
        <div
          style={{
            width: '100%',
            height: '50vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column',
          }}
        >
          <Loading />
          <div style={{ color: '#fff', marginTop: 20, fontSize: 20 }}>
            Recieving transactions
          </div>
        </div>
      );
    }

    return (
      <span>
        <main className="block-body">
          <Pane
            boxShadow="0px 0px 5px #36d6ae"
            paddingX={20}
            paddingY={20}
            marginY={20}
          >
            <Text fontSize="16px" color="#fff">
              You do not have control over the brain. You need EUL tokens to let
              she hear you. If you came from Ethereum or Cosmos you can claim
              the gift of gods. Then start prepare to the greatest tournament in
              universe: <a href="/gol">Game of Links</a>.
            </Text>
          </Pane>
          <Statistics
            atomLeff={formatNumber(atomLeff)}
            won={formatNumber(Math.floor(won * 10 ** -9 * 1000) / 1000)}
            price={formatNumber(
              Math.floor(currentPrice * 10 ** -9 * 1000) / 1000
            )}
            discount={formatNumber(currentDiscount * 100, 3)}
          />
          <Dinamics data3d={dataPlot} dataRewards={dataRewards} />

          {Object.keys(groups).length > 0 && <Table data={groups} pin={pin} />}
        </main>
        <ActionBarTakeOff />
      </span>
    );
  }
}

export default Funding;
