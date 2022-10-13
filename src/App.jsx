import React, { useEffect, useState, useRef } from "react";
import {
  ftGetTokensMetadata,
  fetchAllPools,
  estimateSwap,
  getStablePools,
  ftGetTokenMetadata,
  instantSwap
} from "@ref_finance/ref-sdk";
import {
  NavLogoSimple,
  Near,
  SwapArrowUp,
  SwapArrowDown,
  ModalClose,
  Slider,
  WaringTriangle
} from "./components/icon/icon";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import Modal from "react-modal";
import { wallet } from "./init";
import {
  UseTokensData,
  toReadableNumber,
  toPrecision,
  getExpectedOutputFromActions,
  demo_config,
  getTokenBalance,
  nearMetadata,
  executeMultipleTransactions,
  getURLInfo,
  checkTransaction,
  nearDeposit,
  nearWithdraw,
  isMobile
} from "./services/swap";
import { BeatLoader, ClipLoader } from "react-spinners";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import "./style.css";
const CONFIG = demo_config();
const SUPPORT_LEDGER_KEY = 'REF_FI_DEMO_SUPPORT_LEDGER';
const SLIPPAGE_KEY = 'REF_FI_DEMO_SLIPPAGE';

export function App() {
  const [show, setShow] = useState(false);
  const [showSelectToken, setShowSelectToken] = useState(false);
  const [showSlippage, setShowSlippage] = useState(false);
  const [selectTokenTyle, setSelectTokenTyle] = useState("");
  const [tokenIn, setTokenIn] = useState(null);
  const [tokenOut, setTokenOut] = useState(null);
  const [tokenInAmount, setTokenInAmount] = useState("1");
  const [tokenOutAmount, setTokenOutAmount] = useState();
  const [expectedOutput, setExpectedOutput] = useState();
  const [simplePools, setSimplePools] = useState(null);
  const [stablePools, setStablePools] = useState(null);
  const [stablePoolsDetail, setStablePoolsDetail] = useState(null);
  const [routes, setRoutes] = useState();
  const [swapTodos, setSwapTodos] = useState();
  const [slippageTolerance, setSlippageTolerance] = useState(+(localStorage.getItem(SLIPPAGE_KEY) || 0.5));
  const [supportLedger, setSupportLedger] = useState(localStorage.getItem(SUPPORT_LEDGER_KEY) == '1');
  const [errorStr, setErrorStr] = useState('');
  const [poolLoading, setPoolLoading] = useState(true);
  const [swapLoading, setSwapLoading] = useState(false);
  const [estimateLoading, setEstimateLoading] = useState(true);
  const { txHash, pathname } = getURLInfo();
  const [timer, setTimer] = useState(null);
  const isLogin = wallet.isSignedIn();
  useEffect(() => {
    getAllPools();
    getInitTokenInAndTokenOut()
  }, []);
  useEffect(() => {
    if (txHash && isLogin) {
      checkTransaction(txHash)
        .then((res) => {
          const slippageErrorPattern = /ERR_MIN_AMOUNT|slippage error/i;
          const isSlippageError = res.receipts_outcome.some((outcome) => {
            return slippageErrorPattern.test(
              outcome?.outcome?.status?.Failure?.ActionError?.kind
                ?.FunctionCallError?.ExecutionError
            );
          });
          return {
            isSlippageError,
          };
        })
        .then(({ isSlippageError}) => {
          if (isSlippageError) {
            FailToast(txHash);
          } else {
            swapToast(txHash);
          }
          window.history.replaceState(
            {},
            '',
            window.location.origin + pathname
          );
        });
    }
  }, [txHash, isLogin]);

  useEffect(() => {
    if (tokenIn && tokenOut && !poolLoading) {
      if (!tokenInAmount || +tokenInAmount == 0) {
        setTokenOutAmount('0');
        setExpectedOutput('0');
      } else {
        clearTimeout(timer);
        setEstimateLoading(true)
        const temp_timer = setTimeout(() => {
          getEstimateSwap();
        }, 1000)
        setTimer(temp_timer)
      } 
      history.replaceState({},'',`#${tokenIn.id}|${tokenOut.id}`)
    }
  }, [tokenIn, tokenOut, poolLoading, supportLedger, tokenInAmount]);
  async function getInitTokenInAndTokenOut() {
    const hash = location.hash.substring(1).split('|');
    const [tokenInId, tokenOutId] = hash;
    if (tokenInId && tokenOutId) {
      let tokenIn;
      let tokenOut;
      if (tokenInId == CONFIG.WRAP_NEAR_CONTRACT_ID) {
        tokenIn = nearMetadata;
        tokenIn.id = tokenInId;
      } else {
        tokenIn = await ftGetTokenMetadata(tokenInId); 
      }
      if (tokenOutId == CONFIG.WRAP_NEAR_CONTRACT_ID) {
        tokenOut = nearMetadata;
        tokenOut.id = tokenOutId;
      } else {
        tokenOut = await ftGetTokenMetadata(tokenOutId); 
      }
      const tokenIn_b = await getTokenBalance(tokenInId);
      const tokenOut_b = await getTokenBalance(tokenOutId);
      tokenIn.balance=tokenIn_b;
      tokenOut.balance=tokenOut_b;
      setTokenIn(tokenIn)
      setTokenOut(tokenOut)
    }
  }
  async function getEstimateSwap() {
    const options = {
      enableSmartRouting: !supportLedger,
      stablePools,
      stablePoolsDetail,
    };
    const swapTodos = await estimateSwap({
      tokenIn,
      tokenOut,
      amountIn: tokenInAmount,
      simplePools,
      options,
    }).catch((error) => {
      setErrorStr(error.toString().substring(6))
      setTokenOutAmount('');
      setExpectedOutput('')
    })
    if (swapTodos) {
      const { expectedOutput, routes } = getExpectedOutputFromActions(swapTodos, tokenOut.id);
      setRoutes(routes)
      setTokenOutAmount(toPrecision(expectedOutput.toString(), 8));
      setExpectedOutput(expectedOutput.toString())
      setErrorStr('');
      setSwapTodos(swapTodos)
    }
    setEstimateLoading(false)
  }
  async function getAllPools() {
    const allPools = await fetchAllPools();
    const { ratedPools, simplePools, unRatedPools } = allPools;
    const stablePools = unRatedPools.concat(ratedPools);
    const stablePoolsDetail = await getStablePools(stablePools);
    setSimplePools(simplePools);
    setStablePools(stablePools);
    setStablePoolsDetail(stablePoolsDetail);
    setPoolLoading(false);
  }
  function getLoginAccount() {
    if (isLogin) {
      const accountId = wallet.getAccountId();
      return (
        <span
          onClick={() => {
            setShow(!show);
          }}
        >
          {accountId}
        </span>
      );
    } else {
      return <span onClick={signIn}>Connect to NEAR</span>;
    }
  }
  function signOut() {
    wallet.signOut();
    window.location.replace("/");
  }
  function signIn() {
    wallet.requestSignIn(CONFIG.REF_FARM_BOOST_CONTRACT_ID);
  }
  function switchToken() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setTokenInAmount('1');
    setTokenOutAmount('');
    setExpectedOutput('');
  }
  async function swap() {
    setSwapLoading(true);
    const transactions = await instantSwap({
      tokenIn,
      tokenOut,
      amountIn: tokenInAmount,
      swapTodos,
      slippageTolerance,
      AccountId: wallet.getAccountId()
    }).catch((error) => {
      setSwapLoading(false);
      setErrorStr(error.toString().substring(6))
    })
    if (tokenIn.id == CONFIG.WRAP_NEAR_CONTRACT_ID) {
      transactions.unshift(nearDeposit(tokenInAmount))
    } else if (tokenOut.id == CONFIG.WRAP_NEAR_CONTRACT_ID) {
      const minTokenOutAmout = Number(expectedOutput || '0')*((100 - +slippageTolerance) / 100);
      transactions.push(nearWithdraw(minTokenOutAmout.toString()));
    }
    executeMultipleTransactions(transactions)
  }
  function getSwapButtonStatus() {
    if (tokenIn && tokenOut) {
      const balance = +toReadableNumber(tokenIn.decimals, tokenIn.balance || '0');
      const condition1 = +tokenInAmount > 0;
      const condition2 = +tokenOutAmount > 0;
      let condition3 = +tokenInAmount <= balance;
      if (tokenIn.id == CONFIG.WRAP_NEAR_CONTRACT_ID) {
        condition3 = +tokenInAmount <= balance - 0.5;
      }
      if (condition1 && condition2 && condition3) return true
    }
    return false;
  }
  const swapButtonSwapStatus = getSwapButtonStatus();
  return (
    <>
      <ToastContainer></ToastContainer>
      <div>
        <div className="flex items-center justify-between p-5 mb-5 lg:mb-20">
          <NavLogoSimple></NavLogoSimple>
          <div className="relative flex items-center justify-center rounded-xl border border-gradientFrom text-white px-3 py-0.5 text-xs"
           tabIndex={-1}
           onBlur={() => {setShow(false)}}
          >
            <Near className="mr-2"></Near>
            {getLoginAccount()}
            <FiChevronDown className="text-base ml-0.5"></FiChevronDown>
            <div
              className={`absolute top-8 rounded-lg p-2 bg-cardBg w-full ${
                show ? "" : "hidden"
              }`}
            >
              <span
                className="flex items-center justify-center text-BTCColor"
                onClick={signOut}
              >
                Sign out
              </span>
            </div>
          </div>
        </div>
        <div className="swapContainer bg-dark rounded-lg p-7 xsm:mx-2 lg:w-560px md:w-5/6 lg:m-auto relative">
          <div className="flex items-center justify-between mb-5">
            <span className="text-white text-2xl">Swap</span>
            <Slider onClick={() => {setShowSlippage(true)}}></Slider>
          </div>
          <InputArea
            amount={tokenInAmount}
            setShowSelectToken={setShowSelectToken}
            setSelectTokenTyle={setSelectTokenTyle}
            token={tokenIn}
            changeAmount={setTokenInAmount}
            type="in"
          ></InputArea>
          <div className="flex items-center justify-center border-t border-SwapSplitColor my-14">
            <SwitchButton onClick={switchToken}></SwitchButton>
          </div>
          <InputArea
            amount={tokenOutAmount}
            setShowSelectToken={setShowSelectToken}
            setSelectTokenTyle={setSelectTokenTyle}
            token={tokenOut}
            changeAmount={setTokenOutAmount}
            type="out"
          ></InputArea>
          <div className={`flex items-center error text-sm text-warnColor mt-5 break-all ${errorStr ? '': 'hidden'}`}>
            <WaringTriangle className="transform scale-75 mr-1.5 flex-shrink-0"></WaringTriangle>
              {errorStr}
          </div>
          {
            +tokenOutAmount ? <SwapDetail 
            slippageTolerance={slippageTolerance}
            tokenInAmount={tokenInAmount} 
            tokenOutAmount={tokenOutAmount}
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            routes={routes}
            ></SwapDetail>: null
          }
          
          {isLogin ? (
            <SwapButton
              className="mt-6"
              disabled={ (tokenIn && tokenOut) ? (estimateLoading || swapLoading || !swapButtonSwapStatus) : true}
              onClick={swap}
            >
              <ButtonTextWrapper
                loading={(tokenIn && tokenOut) ? (estimateLoading ||  swapLoading) : false}
                Text={() => (
                  <h1 className="text-lg font-inter font-semibold text-white">
                    Swap
                  </h1>
                )}
              />
            </SwapButton>
          ) : (
            <ConnectButton className="mt-6" onClick={signIn} ></ConnectButton>
          )}
        </div>
        <SelectToken
          setTokenIn={setTokenIn}
          setTokenOut={setTokenOut}
          type={selectTokenTyle}
          isOpen={showSelectToken}
          onRequestClose={() => {
            setShowSelectToken(false);
          }}
        ></SelectToken>
        <SlippageSelector 
          setSupportLedger={setSupportLedger}
          supportLedger={supportLedger}
          slippageTolerance={slippageTolerance}
          setSlippageTolerance={setSlippageTolerance}
          isOpen={showSlippage} 
          onRequestClose={() => {setShowSlippage(false)}}
        ></SlippageSelector>
      </div>
    </>
  );
}

function SwapDetail(props) {
  const { slippageTolerance, tokenInAmount,tokenOutAmount, tokenIn, tokenOut, routes} = props;
  const [showDetailBox, setShowDetailBox] = useState(true);
  function getMinimumReceived() {
    const min = Number(tokenOutAmount) *((100 - Number(slippageTolerance)) / 100);
    return toPrecision(min.toString(), 8)
  }
  function getSwapRate() {
    const rate = Number(tokenInAmount) / Number(tokenOutAmount);
    const displayRate = toPrecision(rate.toString(), 6);
    return `1 ${tokenOut.symbol} ≈ ${displayRate} ${tokenIn.symbol}`;
  }
  function getPoolFee() {
    let route1 = {}
    let route2 = {}
    routes.forEach((route, index) => {
      let totalFee = 0;
      let out = 0;
      route.forEach((r, index) => {
        const { pool, estimate } = r;
        totalFee += pool.fee || pool.total_fee;
        if (index+1 == route.length) {
          out = estimate;
        }
      })
      if (index == 0) {
        route1 = {
          fee: totalFee,
          estimate:out
        }
      } else {
        route2 = {
          fee: totalFee,
          estimate:out
        }
      }
    })
    const { fee:fee1, estimate:estimate1 } = route1;
    const { fee:fee2=0, estimate:estimate2=0 } = route2;
    const tokenout = +estimate1 + +estimate2;
    const out1Percent = +estimate1/tokenout;
    const out2Percent = +estimate2/tokenout;
    const fee1Take = out1Percent * Number(fee1);
    const fee2Take = out2Percent * Number(fee2);
    const totalFee = fee1Take + fee2Take;
    const p = (totalFee / 100);
    const displayTotalFee = toPrecision(p.toString(), 2);
    const amount = (p / 100) * Number(tokenInAmount)
    const displayAmount = toPrecision(amount.toString(), 3);
    return `${displayTotalFee}% / ${displayAmount} ${tokenIn.symbol}`
    
  }
  return <div className="mt-6">
      <div className="flex items-center justify-center mb-4">
        <div className="flex items-center" onClick={() => {setShowDetailBox(!showDetailBox)}}>
          <span className="text-xs text-white">Details</span>
          {
            showDetailBox ?<FiChevronUp className="text-xs font-bold text-white ml-1"></FiChevronUp>:<FiChevronDown className="text-xs font-bold text-white ml-1"></FiChevronDown>
          }
        </div>
      </div>
      <div className={`flex items-center flex-col ${showDetailBox ? '': 'hidden'}`}>
        <div className="flex items-center justify-between w-full my-1.5">
          <span className="text-xs text-primaryText">Minimum received</span>
          <label className="text-xs text-white">{getMinimumReceived()}</label>
        </div>
        <div className="flex items-center justify-between w-full my-1.5">
          <span className="text-xs text-primaryText">Swap rate</span>
          <label className="text-xs text-white font-sans">{getSwapRate()}</label>
        </div>
        <div className="flex items-center justify-between w-full my-1.5">
          <span className="text-xs text-primaryText">Pool fee</span>
          <label className="text-xs text-white">{getPoolFee()}</label>
        </div>
        <div className="flex items-center justify-between w-full my-1.5">
          <span className="text-xs text-primaryText">Slippage</span>
          <label className="text-xs text-white">{slippageTolerance}%</label>
        </div>
      </div>
  </div>
}

function InputArea(props) {
  const {
    changeAmount,
    amount,
    setShowSelectToken,
    setSelectTokenTyle,
    type,
    token,
  } = props;
  function showModal() {
    setShowSelectToken(true);
    if (type == "in") {
      setSelectTokenTyle("in");
    } else if (type == "out") {
      setSelectTokenTyle("out");
    }
  }
  function displayBalance() {
    const b = getBalance();
    return toPrecision(b, 3, true);
  }
  function getBalance() {
    if (token) {
      const { balance, decimals } = token;
      const b = toReadableNumber(decimals, balance || '0');
      return b;
    } else {
      return "0";
    }
  }
  function getMax() {
    const b = getBalance();
    if (token.id == CONFIG.WRAP_NEAR_CONTRACT_ID) {
      const b_r = +b - 0.5;
      if (b_r > 0) {
        return b_r.toString();
      } else {
        return '0'
      }
    }
    return b;
  }
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="w-1 flex-grow">
          <div className="flex items-center justify-between text-xs text-primaryText pl-1 mb-2">
            <div>Balance:<span className="ml-1">{displayBalance(token)}</span></div>
            <span className={`cursor-pointer ${type== 'in' ? '': 'hidden'}`} onClick={() => {changeAmount(getMax())}}>Max</span>
          </div>
          <div className="px-2 bg-black bg-opacity-20 rounded-md overflow-hidden">
            <input
              type="number"
              placeholder="0.0"
              className="text-xl h-10 text-white outline-none"
              disabled={!token || type == "out" ? true : false}
              value={token && amount}
              step="any"
              onChange={({ target }) => {
                changeAmount(target.value);
              }}
            />
          </div>
        </div>
        <div className="flex items-center ml-3 mt-5">
          <div className="flex items-center" onClick={showModal}>
            <span
              className={`text-white text-base ${
                token ? "" : "text-opacity-50"
              }`}
            >
              {token ? token.symbol : "Select"}
            </span>
            <FiChevronDown
              className={`text-white flex-shrink-0 mx-1 ${
                token ? "" : "text-opacity-50"
              }`}
            ></FiChevronDown>
          </div>
          {token ? (
            <img
              src={token.icon}
              className="h-7 w-7 border border-greenColor rounded-full flex-shrink-0"
            ></img>
          ) : (
            <div className="h-7 w-7 border border-greenColor rounded-full flex-shrink-0"></div>
          )}
        </div>
      </div>
    </div>
  );
}

function SwitchButton(props) {
  return (
    <div
     {...props}
      className="absolute flex items-center justify-center w-11 h-11 border border-white border-opacity-40 rounded-full cursor-pointer bg-dark"
    >
      <SwapArrow></SwapArrow>
    </div>
  );
}
function SwapArrow() {
  const upRow = useRef(null);
  const downRow = useRef(null);

  const [mobileAnimation, setMobileAnimation] = useState(false);

  const runSwapAnimation = function () {
    upRow.current.style.animation = "arrowUp 0.5s 0s ease-out 1";
    downRow.current.style.animation = "arrowDown 0.5s 0s ease-out 1";
    setMobileAnimation(true);

    upRow.current.addEventListener("animationend", function () {
      upRow.current.style.animation = "";
      setMobileAnimation(false);
    });
    downRow.current.addEventListener("animationend", function () {
      downRow.current.style.animation = "";
      setMobileAnimation(false);
    });
  };

  return (
    <div className="flex items-center" onClick={runSwapAnimation}>
      <span className={`transition-transform transform`} ref={upRow}>
        <SwapArrowUp light={mobileAnimation} />
      </span>
      <span className={`transition-transform transform`} ref={downRow}>
        <SwapArrowDown light={mobileAnimation} />
      </span>
    </div>
  );
}
function SwapButton(props) {
  const { onClick, disabled, btnClassName, className } = props;
  return (
    <div
      className={`${className ? className : ""} ${
        disabled ? "opacity-40" : ""
      } bg-gradient-to-b from-gradientFrom to-gradientTo hover:from-gradientFromHover to:from-gradientToHover rounded-md h-10 overflow-hidden`}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full h-full ${btnClassName ? btnClassName : ""}`}
      >
        {props.children}
      </button>
    </div>
  );
}

function ConnectButton(props) {
  const { onClick, disabled, btnClassName, className, loading } = props;
  return (
    <div
      className={`${className ? className : ""} ${
        loading ? "opacity-40" : ""
      } bg-gradient-to-b from-gradientFrom to-gradientTo hover:from-gradientFromHover to:from-gradientToHover rounded-md py-2`}
    >
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full h-full text-white ${
          btnClassName ? btnClassName : ""
        }`}
      >
        Connect to NEAR
      </button>
    </div>
  );
}

function SelectToken(props) {
  const { isOpen, onRequestClose, type, setTokenIn, setTokenOut } = props;
  const tokenList = CONFIG.tokenList;
  const cardWidth = isMobile() ? '90vw' : '30vw';
  // const cardHeight = "90h";
  const displayList = UseTokensData(tokenList);
  function displayTokenBalance(token) {
    const { balance, decimals } = token;
    const b = toReadableNumber(decimals, balance);
    return toPrecision(b, 3);
  }
  function selectToken(token) {
    if (type == "in") {
      setTokenIn(token);
    } else if (type == "out") {
      setTokenOut(token);
    }
    onRequestClose();
  }
  return (
    <Modal
      ariaHideApp={false}
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{
        overlay: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 100,
          backdropFilter: "blur(15px)",
          WebkitBackdropFilter: "blur(15px)",
        },
        content: {
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0px",
          inset: "50% auto auto 50%",
          outline: "none",
          border: "none",
          transform: "translate(-50%, -50%)",
          background: "transparent",
        },
      }}
    >
      <div
        className="py-5 rounded-2xl bg-cardBg overflow-auto"
        style={{
          width: cardWidth,
          // maxHeight: cardHeight,
          border: "1px solid rgba(0, 198, 162, 0.5)",
        }}
      >
        <div className="flex items-center justify-between mb-2 px-5">
          <span className="text-sm font-bold text-white">Select Token</span>
          <ModalClose onClick={onRequestClose}></ModalClose>
        </div>
        <div className="h-96 overflow-auto px-5">
          {!displayList ? (
            <div className="flex items-center justify-center py-4 text-white text-sm text-opacity-50">
              Loading...
            </div>
          ) : (
            <tabel className="table table-auto w-full">
              <thead>
                <tr className="font-normal">
                  <th className="pl-2 h-10 text-primaryText text-sm border-b border-gray-500 border-opacity-30 text-left">
                    Asset
                  </th>
                  <th className="text-primaryText text-sm text-right border-b border-gray-500 border-opacity-30">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayList.map((token) => {
                  return (
                    <tr
                      key={token.id}
                      onClick={() => {
                        selectToken(token);
                      }}
                    >
                      <td className="pl-2 h-10 text-white text-xs text-left">
                        <div className="flex items-center">
                          <img
                            src={token.icon}
                            className="border border-greenColor rounded-full flex-shrink-0 mr-1 w-6 h-6"
                          ></img>
                          {token.symbol}
                        </div>
                      </td>
                      <td className="text-white text-xs text-right">
                        {displayTokenBalance(token)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </tabel>
          )}
        </div>
      </div>
    </Modal>
  );
}
function BeatLoading() {
  return <BeatLoader size={5} color="#ffffff" />;
}
function ButtonTextWrapper({ Text, loading }) {
  return <>{loading ? <BeatLoading /> : <Text />}</>;
}
function SlippageSelector(props) {
  const { isOpen, onRequestClose, slippageTolerance, setSlippageTolerance, setSupportLedger, supportLedger } = props;
  const [invalid, setInvalid] = useState(false);
  const [warn, setWarn] = useState(false);
  const [symbolsArr] = useState(['e', 'E', '+', '-']);
  const cardWidth =  isMobile() ?"90vw":"25vw";
  const cardHeight = "90vw";
  const validSlippages = [0.1, 0.5, 1.0];
  const ref = useRef(null);
  useEffect(() => {
    if (Number(slippageTolerance) > 1) {
      setWarn(true);
    }
  }, [])
 
  const handleBtnChange = (amount) => {
    if (Number(amount) > 0 && Number(amount) < 100) {
      if (Number(amount) > 1) {
        setWarn(true);
      } else {
        setWarn(false);
      }
      setInvalid(false);
      setSlippageTolerance(amount);
      localStorage.setItem(SLIPPAGE_KEY, amount)
    } else {
      setInvalid(true);
      setWarn(false);
      setSlippageTolerance(amount);
    }
  };
  function closeModal() {
    if (invalid) return;
    onRequestClose()
  }
  return (
    <Modal
      ariaHideApp={false}
      isOpen={isOpen}
      onRequestClose={closeModal}
      style={{
        overlay: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 100,
          // backdropFilter: 'blur(15px)',
          // WebkitBackdropFilter: 'blur(15px)',
        },
        content: {
          position: "absolute",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0px",
          inset: "25% auto auto 50%",
          outline: "none",
          border: "none",
          transform: "translate(-50%, -50%)",
          background: "transparent",
        },
      }}
    >
      <div
        className="p-5 rounded-lg bg-cardBg overflow-auto"
        style={{
          width: cardWidth,
          maxHeight: cardHeight,
          border: "1px solid rgba(0, 198, 162, 0.5)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="text-base text-center text-white">
            Transaction Settings
          </span>
          <ModalClose onClick={closeModal}></ModalClose>
        </div>
        <div className="text-sm text-white my-4">Slippage tolerance</div>
        <div className="flex text-white items-center">
          <div className="w-48 flex justify-between bg-slipBg bg-opacity-40 rounded">
            {validSlippages.map((slippage) => (
              <button
                key={slippage}
                className={` w-14 h-7 text-center focus:outline-none text-sm hover:bg-gradientFrom rounded ${
                  slippage == slippageTolerance
                    ? "text-chartBg bg-gradientFrom"
                    : ""
                }`}
                type="button"
                onClick={() => handleBtnChange(slippage)}
              >
                {slippage}%
              </button>
            ))}
          </div>
          <input
            ref={ref}
            max={99.99999}
            min={0.000001}
            value={slippageTolerance}
            onWheel={() => ref.current.blur()}
            step="any"
            className={`${
              slippageTolerance && !invalid && !warn
                ? "outline-none border border-gradientFrom normal-input text-gradientFrom bg-opacity-0"
                : ""
            } focus:bg-opacity-0 w-14 h-7 text-center text-sm rounded mx-2 bg-gray-500 ${
              invalid && !warn
                ? "outline-none border border-error text-error bg-opacity-0 invalid-input"
                : ""
            } ${
              warn ? "outline-none border border-warn text-warn bg-opacity-0 warn-input" : ""
            }`}
            type="number"
            required={true}
            placeholder=""
            onChange={({ target }) => handleBtnChange(target.value)}
            onKeyDown={(e) => symbolsArr.includes(e.key) && e.preventDefault()}
          />
          %
        </div>
        <div className="flex items-center mt-6">
          <span className="text-sm text-white mr-2">Support Ledger</span>
          <CustomSwitch
              isOpen={supportLedger}
              setIsOpen={setSupportLedger}
            />
        </div>
      </div>
    </Modal>
  );
}
function CustomSwitch({
  isOpen,
  setIsOpen
}) {
  return (
    <div
      className={`ml-3 cursor-pointer ${
        isOpen ? 'bg-gradientFrom' : 'bg-farmSbg'
      }  p-0.5 flex items-center`}
      style={{
        height: '16px',
        width: '29px',
        borderRadius: '20px',
      }}
      onClick={() => {
        if (isOpen) {
          setIsOpen(false);
          localStorage.removeItem(SUPPORT_LEDGER_KEY);
        } else {
          setIsOpen(true);
          localStorage.setItem(SUPPORT_LEDGER_KEY, '1');
        }
      }}
    >
      <div
        className={`rounded-full bg-white transition-all ${
          isOpen ? 'transform translate-x-3 relative left-px' : ''
        }`}
        style={{
          width: '12px',
          height: '12px',
        }}
      ></div>
    </div>
  );
}
function swapToast(txHash){
  toast(
    <a
      className="text-white w-full h-full pl-1.5"
      // href={`${getConfig().explorerUrl}/transactions/${txHash}`}
      // target="_blank"
      // style={{
      //   lineHeight: '48px',
      // }}
    >
      {/* <FormattedMessage
        id="swap_successful_click_to_view"
        defaultMessage="Swap successful. Click to view"
      /> */}
      Swap successful.
    </a>,
    {
      autoClose: 8000,
      closeOnClick: true,
      hideProgressBar: false,
      progressStyle: {
        background: '#00FFD1',
        borderRadius: '8px',
      },
      style: {
        background: '#1D2932',
        boxShadow: '0px 0px 10px 10px rgba(0, 0, 0, 0.15)',
        borderRadius: '8px',
      },
    }
  );
};
function FailToast(){
  toast(
    <a
      className="text-white w-full h-full pl-1.5"
    >
      Swap failed.
    </a>,
    {
      autoClose: 8000,
      closeOnClick: true,
      hideProgressBar: false,
      progressStyle: {
        background: '#00FFD1',
        borderRadius: '8px',
      },
      style: {
        background: '#1D2932',
        boxShadow: '0px 0px 10px 10px rgba(0, 0, 0, 0.15)',
        borderRadius: '8px',
      },
    }
  );
};

export function CloseIcon({
  width,
  height,
}) {
  return (
    <svg
      width={width || '10'}
      height={height || '10'}
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.99977 4.25444L0.899889 0.154551C0.800474 0.058533 0.667324 0.00540298 0.529117 0.00660396C0.39091 0.00780495 0.258703 0.0632409 0.160972 0.160972C0.0632409 0.258703 0.00780497 0.39091 0.00660398 0.529117C0.005403 0.667324 0.0585331 0.800474 0.154551 0.899889L4.25391 4.99977L0.154551 9.09966C0.105577 9.1486 0.0667215 9.20671 0.0402036 9.27066C0.0136857 9.33462 2.45072e-05 9.40317 3.29429e-08 9.47241C-2.44413e-05 9.54164 0.0135883 9.61021 0.040061 9.67418C0.0665336 9.73816 0.105348 9.79629 0.154287 9.84526C0.203227 9.89424 0.261334 9.93309 0.325289 9.95961C0.389245 9.98613 0.457798 9.99979 0.527034 9.99981C0.596269 9.99984 0.664832 9.98623 0.728806 9.95975C0.792781 9.93328 0.850915 9.89447 0.899889 9.84553L4.99977 5.74511L9.09966 9.84553C9.14863 9.8945 9.20678 9.93335 9.27076 9.95985C9.33475 9.98636 9.40333 10 9.47259 10C9.54185 10 9.61044 9.98636 9.67442 9.95985C9.73841 9.93335 9.79655 9.8945 9.84553 9.84553C9.8945 9.79655 9.93335 9.73841 9.95985 9.67442C9.98636 9.61044 10 9.54185 10 9.47259C10 9.40333 9.98636 9.33475 9.95985 9.27076C9.93335 9.20678 9.8945 9.14863 9.84553 9.09966L5.74511 4.99977L9.84553 0.899889C9.94436 0.800981 9.99986 0.666861 9.99981 0.527034C9.99976 0.387206 9.94417 0.253125 9.84526 0.154287C9.74636 0.0554494 9.61224 -4.93911e-05 9.47241 3.29824e-08C9.33258 4.94571e-05 9.1985 0.0556431 9.09966 0.154551L4.99977 4.25391V4.25444Z"
        fill="#7E8A93"
      />
    </svg>
  );
}
